/**
 * /_tidy/revisions: the site's revision history for the signed-in editor,
 * read from the control plane with the site's own secret. No bearer: the
 * browser calls it from the editor bar, and the Astro session is the gate.
 *
 *   GET  ?path=/reviews            the revisions (every publish, newest first)
 *   GET  ?id=<revision>&path=/x    the page as it was in that revision (HTML)
 *   POST { action: "restore", id } put the live site (and staging) back on it
 *   POST { action: "publish" }     make the live site follow staging now
 */
import type { APIContext, APIRoute } from "astro";
import { workerEnv } from "../lib/env";
import { isSafeLocalPath, json, readJson } from "../lib/http";
import { methodNotAllowed } from "./_shared";

export const prerender = false;

interface ControlEnv {
	TIDY_CONTROL_ORIGIN?: unknown;
	TIDY_SITE_ID?: unknown;
	TIDY_PLATFORM_SECRET?: unknown;
	PLATFORM?: { fetch(input: string, init?: RequestInit): Promise<Response> };
}

async function control(context: APIContext): Promise<{ call(path: string, init?: RequestInit): Promise<Response> } | Response> {
	const user = context.session ? await context.session.get("user") : null;
	if (!user) return new Response("Unauthorized", { status: 401 });
	const env = (await workerEnv()) as ControlEnv | undefined;
	const origin = env?.TIDY_CONTROL_ORIGIN;
	const siteId = env?.TIDY_SITE_ID;
	const secret = env?.TIDY_PLATFORM_SECRET;
	const platform = env?.PLATFORM;
	if (!platform || typeof origin !== "string" || typeof siteId !== "string" || typeof secret !== "string") return new Response("Not found", { status: 404 });
	const base = `${origin.replace(/\/+$/, "")}/sites/${encodeURIComponent(siteId)}`;
	return {
		call: (path, init = {}) => platform.fetch(`${base}${path}`, { ...init, headers: { authorization: `Bearer ${secret}`, ...(init.headers as Record<string, string> | undefined) } })
	};
}

export const GET: APIRoute = async (context) => {
	const c = await control(context);
	if (c instanceof Response) return c;
	const id = context.url.searchParams.get("id");
	const rawPath = context.url.searchParams.get("path");
	const path = isSafeLocalPath(rawPath) ? rawPath.replace(/[?#].*$/, "") : "/";
	if (id) {
		if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "bad revision id" }, 400);
		const r = await c.call(`/releases/${id}/page?path=${encodeURIComponent(path)}`);
		if (!r.ok) return json({ error: r.status === 404 ? "That page was not in this revision." : "The revision could not be read." }, r.status === 404 ? 404 : 502);
		// A page comes back as HTML; a path with an extension is one of the
		// revision's own files (its stylesheets, scripts, images), passed through
		// with its type so the page shows the way it was built.
		const type = r.headers.get("content-type") ?? "application/octet-stream";
		return new Response(r.body, { headers: { "content-type": type, "cache-control": "no-store" } });
	}
	const r = await c.call("/releases");
	if (!r.ok) return json({ error: "The revisions could not be read." }, 502);
	const body = (await r.json().catch(() => ({}))) as { releases?: Array<{ deployId: string; at: string; pages?: number; restoredFrom?: string }> };
	return json({ revisions: (body.releases ?? []).map((x) => ({ id: x.deployId, at: x.at, pages: x.pages ?? null, restoredFrom: x.restoredFrom ?? null })) }, 200, { "cache-control": "no-store" });
};

export const POST: APIRoute = async (context) => {
	const c = await control(context);
	if (c instanceof Response) return c;
	const body = await readJson<{ action?: unknown; id?: unknown; keepContent?: unknown }>(context.request);
	if (body.action === "publish") {
		const r = await c.call("/publish-live", { method: "POST" });
		return json(await r.json().catch(() => ({})), r.ok ? 200 : 502);
	}
	if (body.action === "restore") {
		if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) return json({ error: "bad revision id" }, 400);
		const r = await c.call(`/releases/${body.id}/restore`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keepContent: body.keepContent === true }) });
		return json(await r.json().catch(() => ({})), r.ok ? 200 : 502);
	}
	return json({ error: "action must be publish or restore" }, 400);
};

export const ALL = methodNotAllowed("GET, POST");
