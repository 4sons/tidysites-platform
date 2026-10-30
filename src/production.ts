/**
 * The live site's worker. The live site is the static snapshot of staging
 * served as assets; this runs first only for the paths the publish names
 * (the API, and the addresses whose redirect says "gone"), and for the
 * not-found page. It never touches EmDash or a database.
 *
 *   import { productionFetch } from "@tideworthy/tidysites-platform/production";
 *   export default { fetch: (request, env) => productionFetch(request, env, { api: handleApi }) };
 *
 * `_gone.json` in the snapshot lists the paths that answer 410 or 451, with
 * their status: the publish writes it from the site's redirects.
 */
export interface ProductionEnv {
	ASSETS: { fetch(input: Request | URL | string): Promise<Response> };
}

export interface ProductionOptions<E extends ProductionEnv> {
	/** The site's own API, mounted at /api/*. */
	api?: (request: Request, env: E) => Promise<Response>;
}

export type GoneList = Record<string, 410 | 451>;

async function readGone(env: ProductionEnv, origin: string): Promise<GoneList> {
	try {
		const r = await env.ASSETS.fetch(new URL("/_gone.json", origin));
		if (!r.ok) return {};
		const v = (await r.json()) as unknown;
		return v && typeof v === "object" ? (v as GoneList) : {};
	} catch {
		return {};
	}
}

async function notFound(env: ProductionEnv, origin: string, status = 404): Promise<Response> {
	const nf = await env.ASSETS.fetch(new URL("/404.html", origin));
	return new Response(nf.body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function productionFetch<E extends ProductionEnv>(request: Request, env: E, options: ProductionOptions<E> = {}): Promise<Response> {
	const url = new URL(request.url);
	if (url.pathname.startsWith("/api/") && options.api) return options.api(request, env);
	// Resized pictures (/_tidy/img/<width>/<key>) are plain files in the snapshot, fetched from staging at publish.
	if (url.pathname.startsWith("/_tidy/img/")) {
		const r = await env.ASSETS.fetch(request);
		if (r.ok) return r;
		const key = url.pathname.split("/").slice(4).join("/");
		return key ? Response.redirect(new URL(`/_emdash/api/media/file/${key}`, url.origin).toString(), 302) : notFound(env, url.origin);
	}
	const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
	const gone = await readGone(env, url.origin);
	const status = gone[path];
	if (status === 410 || status === 451) return notFound(env, url.origin, status);
	return notFound(env, url.origin);
}
