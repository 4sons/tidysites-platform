/**
 * /_tidy/change: a change request from the signed-in person on the staging
 * site, handed to the platform through the control plane with the site's
 * own secret. The Astro session is the gate; the person's name and email
 * come from the site's user record.
 *
 *   GET                       → { name, email } of the signed-in person
 *   POST { body, pageUrl? }  → { ok, changeId }
 */
import type { APIRoute } from "astro";
import { isSafeLocalPath, json, readJson } from "../lib/http";
import { methodNotAllowed, platformRoute } from "./_shared";

export const prerender = false;

interface ControlEnv {
	TIDY_CONTROL_ORIGIN?: unknown;
	TIDY_SITE_ID?: unknown;
	TIDY_PLATFORM_SECRET?: unknown;
	PLATFORM?: { fetch(input: string, init?: RequestInit): Promise<Response> };
}

export const POST: APIRoute = platformRoute(
	async (context, deps, rawEnv) => {
		const session = context.session ? ((await context.session.get("user")) as { id?: string } | null) : null;
		if (!session?.id) return new Response("Unauthorized", { status: 401 });
		const env = rawEnv as ControlEnv;
		const origin = env.TIDY_CONTROL_ORIGIN;
		const siteId = env.TIDY_SITE_ID;
		const secret = env.TIDY_PLATFORM_SECRET;
		const platform = env.PLATFORM;
		if (!platform || typeof origin !== "string" || typeof siteId !== "string" || typeof secret !== "string") return json({ error: "not configured" }, 503);
		const input = await readJson<{ body?: unknown; pageUrl?: unknown }>(context.request);
		const body = typeof input.body === "string" ? input.body.trim() : "";
		if (!body) return json({ error: "Say what you would like changed." }, 400);
		const pageUrl = isSafeLocalPath(input.pageUrl) ? input.pageUrl : null;
		const user = await deps.store.findUserById(session.id);
		const r = await platform.fetch(`${origin.replace(/\/+$/, "")}/sites/${encodeURIComponent(siteId)}/changes`, {
			method: "POST",
			headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
			body: JSON.stringify({ body: body.slice(0, 10_000), pageUrl, requester: user ? { name: user.name, email: user.email } : null })
		});
		const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
		return json(r.ok ? { ok: true, changeId: j.changeId ?? null } : { error: (j.error as string) ?? "The request could not be sent." }, r.ok ? 200 : 502, { "cache-control": "no-store" });
	},
	{ requireBearer: false }
);

/** Who is signed in, for the panel's greeting: { name, email } or 401. */
export const GET: APIRoute = platformRoute(
	async (context, deps) => {
		const session = context.session ? ((await context.session.get("user")) as { id?: string } | null) : null;
		if (!session?.id) return new Response("Unauthorized", { status: 401 });
		const user = await deps.store.findUserById(session.id);
		return json({ name: user?.name ?? null, email: user?.email ?? null }, 200, { "cache-control": "no-store" });
	},
	{ requireBearer: false }
);

export const ALL = methodNotAllowed("GET, POST");
