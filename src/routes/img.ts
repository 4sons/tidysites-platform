/**
 * GET /_tidy/img/<width>/<key>: a stored picture resized to one of a few
 * widths and re-encoded as WebP, so a phone downloads a phone-sized file. The
 * template prints these as `srcset` candidates beside the original; the
 * browser picks one. Resizing uses the worker's Images binding and the
 * result is immutable (a storage key never changes its bytes), so the edge
 * and the publish snapshot keep each variant once. A site without the
 * binding, or a file the resizer cannot read, answers with the original.
 */
import type { APIRoute } from "astro";
import { workerEnv } from "../lib/env";
import { IMAGE_WIDTHS } from "../lib/images";

export const prerender = false;

type Storage = { download(key: string): Promise<{ body: ReadableStream | null; size: number; contentType: string; lastModified?: Date | string | null }> };
type ImagesBinding = {
	input(stream: ReadableStream): { transform(opts: { width?: number; height?: number; fit?: string }): { output(opts: { format: string; quality?: number }): Promise<{ response(): Response }> } };
};

const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;
const RASTER = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

export const GET: APIRoute = async ({ params, locals }) => {
	const width = Number(params.width ?? "");
	const key = String(params.key ?? "");
	if (!IMAGE_WIDTHS.includes(width as (typeof IMAGE_WIDTHS)[number]) || !KEY.test(key) || key.includes("..")) return new Response("Not found", { status: 404 });
	const original = `/_emdash/api/media/file/${key}`;
	const storage = (locals as { emdash?: { storage?: Storage } }).emdash?.storage;
	const env = await workerEnv();
	const images = env?.IMAGES as ImagesBinding | undefined;
	if (!storage || !images) return Response.redirect(original, 302);
	try {
		const file = await storage.download(key);
		if (!file.body || !RASTER.has(file.contentType) || file.contentType === "image/gif") return Response.redirect(original, 302);
		const out = await images.input(file.body).transform({ width, fit: "scale-down" }).output({ format: "image/webp", quality: 82 });
		const r = out.response();
		const headers = new Headers(r.headers);
		headers.set("cache-control", "public, max-age=31536000, immutable");
		headers.set("content-disposition", "inline");
		headers.set("vary", "Accept");
		return new Response(r.body, { status: 200, headers });
	} catch {
		return Response.redirect(original, 302);
	}
};

export const ALL: APIRoute = () => new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });
