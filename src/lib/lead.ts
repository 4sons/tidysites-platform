/**
 * The lead route every site serves at /api/lead, on staging (an Astro route)
 * and on the live site (the production worker), so a theme's server routes
 * delegate here and never touch EmDash or the database. Takes a posted form
 * (form-encoded or JSON), drops honeypot hits, checks Turnstile when a secret
 * is bound, keeps every answer, and forwards the lead to the control plane,
 * which hands it to the platform (stored beside the site, emailed to the
 * site's recipients, sent to its webhooks).
 */
export interface LeadEnv {
	TIDY_CONTROL_ORIGIN?: string;
	TIDY_SITE_ID?: string;
	TIDY_PLATFORM_SECRET?: string;
	/** Turnstile secret; when set, a valid token is required. */
	TURNSTILE_SECRET?: string;
	/** Service binding to the control plane (platform-hosted sites); plain fetch otherwise. */
	PLATFORM?: { fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> };
}

export interface Lead {
	name: string;
	email: string | null;
	phone: string | null;
	/** Which form sent it, by its name. */
	form: string | null;
	/** Every other answer, under the question's label. */
	fields: Record<string, string>;
	page: string | null;
	submittedAt: string;
}

export interface LeadOutcome { ok: boolean; status: number; error?: string; lead?: Lead; forwarded?: boolean; forwardStatus?: number | string }

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const RESERVED = new Set(["name", "email", "phone", "form", "website_hp", "cf-turnstile-response"]);

/** The posted body as flat strings; repeated names (checkbox groups) join with ", ". */
export async function readLeadBody(request: Request): Promise<Record<string, string>> {
	const ct = request.headers.get("content-type") ?? "";
	if (ct.includes("application/json")) {
		const j = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(j)) {
			if (k === "fields" && v && typeof v === "object") for (const [fk, fv] of Object.entries(v as Record<string, unknown>)) out[fk] = String(fv ?? "");
			else if (v !== null && v !== undefined && typeof v !== "object") out[k] = String(v);
		}
		return out;
	}
	const form = await request.formData();
	const out: Record<string, string> = {};
	for (const [k, v] of form.entries()) {
		const s = typeof v === "string" ? v : "";
		out[k] = k in out && out[k] ? `${out[k]}, ${s}` : s;
	}
	return out;
}

/** The lead a posted body describes: contact columns, the form's name, and every other answer labelled. */
export function leadFrom(body: Record<string, string>, page: string | null, now = () => new Date()): Lead {
	const labels: Record<string, string> = {};
	for (const [k, v] of Object.entries(body)) if (k.startsWith("label:")) labels[k.slice(6)] = v;
	const fields: Record<string, string> = {};
	for (const [k, v] of Object.entries(body)) {
		if (RESERVED.has(k) || k.startsWith("label:")) continue;
		const value = v.trim();
		if (!value) continue;
		const label = (labels[k] ?? k).trim().slice(0, 100);
		fields[label] = value.slice(0, 5000);
	}
	return {
		name: (body.name ?? "").trim().slice(0, 300),
		email: (body.email ?? "").trim().slice(0, 320) || null,
		phone: (body.phone ?? "").trim().slice(0, 50) || null,
		form: (body.form ?? "").trim().slice(0, 100) || null,
		fields,
		page,
		submittedAt: now().toISOString(),
	};
}

/** Verify a Turnstile token; true when no secret is bound. */
export async function turnstileOk(env: LeadEnv, token: string | undefined, ip: string | null, doFetch: typeof fetch = fetch): Promise<{ ok: boolean; error?: string }> {
	if (!env.TURNSTILE_SECRET) return { ok: true };
	if (!token) return { ok: false, error: "Please complete the verification." };
	const v = await doFetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip ?? undefined }),
	});
	const ok = ((await v.json().catch(() => ({}))) as { success?: boolean }).success === true;
	return ok ? { ok: true } : { ok: false, error: "Verification failed. Please try again." };
}

/** Forward a lead to the control plane. `forwarded` is false when the site is not platform-hosted or the control plane refused. */
export async function forwardLead(env: LeadEnv, lead: Lead, doFetch: typeof fetch = fetch): Promise<{ forwarded: boolean; status: number | string }> {
	if (!env.TIDY_CONTROL_ORIGIN || !env.TIDY_SITE_ID || !env.TIDY_PLATFORM_SECRET) return { forwarded: false, status: "not configured" };
	try {
		const f = env.PLATFORM ? env.PLATFORM.fetch.bind(env.PLATFORM) : doFetch;
		const r = await f(`${env.TIDY_CONTROL_ORIGIN}/sites/${env.TIDY_SITE_ID}/leads`, {
			method: "POST",
			headers: { authorization: `Bearer ${env.TIDY_PLATFORM_SECRET}`, "content-type": "application/json" },
			body: JSON.stringify({ ...lead, message: lead.fields["How can we help?"] ?? lead.fields.message ?? lead.fields["Message"] ?? null }),
		});
		return { forwarded: r.ok, status: r.status };
	} catch (err) {
		return { forwarded: false, status: `error: ${String(err).slice(0, 200)}` };
	}
}

/**
 * Handle POST /api/lead. A browser form post without JavaScript is answered
 * with a redirect to /thank-you; a fetch with `accept: application/json`
 * gets `{ ok, forwarded }`.
 */
export async function handleLead(request: Request, env: LeadEnv, opts: { fetch?: typeof fetch; thankYouPath?: string } = {}): Promise<Response> {
	if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
	const body = await readLeadBody(request);
	if (body.website_hp) return json({ ok: true });
	const ts = await turnstileOk(env, body["cf-turnstile-response"], request.headers.get("cf-connecting-ip"), opts.fetch);
	if (!ts.ok) return json({ ok: false, error: ts.error }, 400);
	const lead = leadFrom(body, request.headers.get("referer"));
	if (!lead.name || !(lead.email || lead.phone)) return json({ ok: false, error: "Name and an email or phone are required." }, 400);
	const fw = await forwardLead(env, lead, opts.fetch);
	if (!fw.forwarded) console.error("[lead] forward failed:", fw.status);
	const accept = request.headers.get("accept") ?? "";
	if (accept.includes("text/html") && !accept.includes("application/json")) return Response.redirect(new URL(opts.thankYouPath ?? "/thank-you", new URL(request.url).origin).toString(), 303);
	return json({ ok: true, forwarded: fw.forwarded, forwardStatus: fw.status });
}
