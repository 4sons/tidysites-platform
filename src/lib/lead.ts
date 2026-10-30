/**
 * The lead route every site serves at /api/lead, on staging (an Astro route)
 * and on the live site (the production worker), so a theme's server routes
 * delegate here and never touch EmDash or the database. Takes a posted form
 * (form-encoded or JSON), drops honeypot hits, checks Turnstile when a secret
 * is bound and the form asks for it, keeps every answer, and forwards the lead to the control plane,
 * which hands it to the platform (stored beside the site, emailed to the
 * site's recipients, sent to its webhooks).
 */
import { readBotCheck } from "./botcheck";
export interface LeadEnv {
	TIDY_CONTROL_ORIGIN?: string;
	TIDY_SITE_ID?: string;
	TIDY_PLATFORM_SECRET?: string;
	/** Turnstile secret; when set, a valid token is required. */
	TURNSTILE_SECRET?: string;
	/** Service binding to the control plane (platform-hosted sites); plain fetch otherwise. */
	PLATFORM?: { fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> };
	/** The site's media bucket: a file a visitor attaches to a form is kept here under leads/. */
	MEDIA?: { put(key: string, value: ArrayBuffer | ReadableStream | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>; get(key: string): Promise<{ body: ReadableStream | null; httpMetadata?: { contentType?: string }; size?: number } | null> };
}

export interface Lead {
	name: string;
	email: string | null;
	phone: string | null;
	/** Which form sent it, by its name. */
	form: string | null;
	/** Every other answer, under the question's label. */
	fields: Record<string, string>;
	/** Files the visitor attached: the question's label, the file's name, size and type, and its key in the site's bucket. */
	files: LeadFile[];
	page: string | null;
	submittedAt: string;
}
export interface LeadFile { label: string; name: string; size: number; type: string; key: string }

/** What a form may attach: documents and photos, up to this size. */
export const LEAD_FILE_TYPES = /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/plain|text\/rtf|application\/rtf|image\/(jpeg|png|gif|webp|heic|heif))$/i;
export const LEAD_FILE_MAX = 10 * 1024 * 1024;

export interface LeadOutcome { ok: boolean; status: number; error?: string; lead?: Lead; forwarded?: boolean; forwardStatus?: number | string }

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const RESERVED = new Set(["name", "email", "phone", "form", "website_hp", "cf-turnstile-response", "bot_check"]);

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
		if (typeof v !== "string") continue;
		out[k] = k in out && out[k] ? `${out[k]}, ${v}` : v;
	}
	return out;
}

/** The files a multipart post carries, by field name; empty for JSON and plain form posts. */
export async function readLeadFiles(request: Request): Promise<Array<{ field: string; file: File }>> {
	const ct = request.headers.get("content-type") ?? "";
	if (!ct.includes("multipart/form-data")) return [];
	const form = await request.formData().catch(() => null);
	if (!form) return [];
	const out: Array<{ field: string; file: File }> = [];
	for (const [k, v] of form.entries()) if (typeof v !== "string" && v.size > 0) out.push({ field: k, file: v });
	return out;
}

/** Keep the attached files in the site's bucket under leads/, refusing what is not a document or a photo or is too big; the lead names each one. */
export async function storeLeadFiles(env: LeadEnv, files: Array<{ field: string; file: File }>, labels: Record<string, string>, now = () => new Date()): Promise<{ files: LeadFile[]; refused: string[] }> {
	const out: LeadFile[] = []; const refused: string[] = [];
	if (!env.MEDIA || !files.length) return { files: out, refused: files.map((f) => f.file.name) };
	const stamp = now().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
	for (const { field, file } of files.slice(0, 5)) {
		if (!LEAD_FILE_TYPES.test(file.type) || file.size > LEAD_FILE_MAX) { refused.push(file.name); continue; }
		const name = file.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "file";
		const key = `leads/${stamp}-${Math.random().toString(36).slice(2, 8)}/${name}`;
		await env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
		out.push({ label: (labels[field] ?? field).trim().slice(0, 100), name: file.name.slice(0, 200), size: file.size, type: file.type, key });
	}
	return { files: out, refused };
}

/** The lead a posted body describes: contact columns, the form's name, and every other answer labelled. */
/** The question labels a form posts beside its answers (label:<field> → label). */
export function leadLabels(body: Record<string, string>): Record<string, string> {
	const labels: Record<string, string> = {};
	for (const [k, v] of Object.entries(body)) if (k.startsWith("label:")) labels[k.slice(6)] = v;
	return labels;
}

export function leadFrom(body: Record<string, string>, page: string | null, now = () => new Date(), files: LeadFile[] = []): Lead {
	const labels = leadLabels(body);
	const fields: Record<string, string> = {};
	for (const [k, v] of Object.entries(body)) {
		if (RESERVED.has(k) || k.startsWith("label:")) continue;
		const value = v.trim();
		if (!value) continue;
		const label = (labels[k] ?? k).trim().slice(0, 100);
		fields[label] = value.slice(0, 5000);
	}
	for (const f of files) fields[f.label] = f.name;
	return {
		name: (body.name ?? "").trim().slice(0, 300),
		email: (body.email ?? "").trim().slice(0, 320) || null,
		phone: (body.phone ?? "").trim().slice(0, 50) || null,
		form: (body.form ?? "").trim().slice(0, 100) || null,
		fields,
		files,
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
	const attachments = request.clone() as Request;
	const body = await readLeadBody(request);
	if (body.website_hp) return json({ ok: true });
	// The form's own choice, signed into the page: the trap field alone, or Turnstile too. No token (a page published before the choice existed) keeps the old rule: Turnstile whenever the secret is bound.
	const check = env.TURNSTILE_SECRET ? await readBotCheck(env.TURNSTILE_SECRET, body.bot_check, body.form || "contact") : null;
	if (check !== "trap") {
		const ts = await turnstileOk(env, body["cf-turnstile-response"], request.headers.get("cf-connecting-ip"), opts.fetch);
		if (!ts.ok) return json({ ok: false, error: ts.error }, 400);
	}
	const stored = await storeLeadFiles(env, await readLeadFiles(attachments), leadLabels(body));
	const lead = leadFrom(body, request.headers.get("referer"), undefined, stored.files);
	if (stored.refused.length) lead.fields["Files not accepted"] = stored.refused.join(", ");
	// A name is wanted whenever there is a phone (someone will call); an email alone is enough (a newsletter signup).
	if (!(lead.email || lead.phone)) return json({ ok: false, error: "An email or phone is required." }, 400);
	if (!lead.name && !lead.email) return json({ ok: false, error: "A name is required." }, 400);
	const fw = await forwardLead(env, lead, opts.fetch);
	if (!fw.forwarded) console.error("[lead] forward failed:", fw.status);
	const accept = request.headers.get("accept") ?? "";
	if (accept.includes("text/html") && !accept.includes("application/json")) return Response.redirect(new URL(opts.thankYouPath ?? "/thank-you", new URL(request.url).origin).toString(), 303);
	return json({ ok: true, forwarded: fw.forwarded, forwardStatus: fw.status });
}
