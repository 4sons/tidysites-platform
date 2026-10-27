/**
 * GET /_tidy/lead-file?key=leads/...: a file a visitor attached to a form,
 * from the site's bucket, for the platform's lead page (the control plane
 * passes it through with the site's secret). Only keys under leads/.
 */
import { json } from "../lib/http";
import { methodNotAllowed, platformRoute } from "./_shared";

export const prerender = false;

export const GET = platformRoute(async (context, _deps, env) => {
	const key = context.url.searchParams.get("key") ?? "";
	if (!/^leads\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(key)) return json({ ok: false, error: "bad key" }, 400);
	const media = env.MEDIA as { get(key: string): Promise<{ body: ReadableStream | null; httpMetadata?: { contentType?: string }; size?: number } | null> } | undefined;
	const obj = media ? await media.get(key) : null;
	if (!obj || !obj.body) return json({ ok: false, error: "not found" }, 404);
	const name = key.split("/").pop() ?? "file";
	return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" } });
});

export const ALL = methodNotAllowed("GET");
