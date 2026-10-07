/**
 * Astro middleware registered by tidyPlatform(): the framing policy from
 * TIDY_FRAME_ANCESTORS, and no indexing of the staging site. This worker is
 * the staging site (the live site is a static copy served by its own small
 * worker), so every answer here carries noindex, robots.txt disallows
 * everything and the sitemap is gone. The publish crawl identifies itself
 * and gets the real robots.txt and sitemap, which is what the live copy
 * ships.
 */
import type { MiddlewareHandler } from "astro";
import { workerEnv } from "./lib/env";
import { applyFramePolicy, frameAncestors } from "./lib/frame";

const PUBLISH_CRAWL = "tidysites-publish";
const NOINDEX = "noindex, nofollow";

export const onRequest: MiddlewareHandler = async (context, next) => {
	const crawl = context.request.headers.get("user-agent") === PUBLISH_CRAWL;
	if (!crawl) {
		const path = context.url.pathname;
		if (path === "/robots.txt") {
			return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": NOINDEX } });
		}
		if (path === "/sitemap.xml" || path === "/sitemap-index.xml" || /^\/sitemap-\d+\.xml$/.test(path)) {
			return new Response("Not found", { status: 404, headers: { "cache-control": "no-store", "x-robots-tag": NOINDEX } });
		}
	}
	const response = await next();
	const env = await workerEnv();
	const ancestors = frameAncestors(env?.TIDY_FRAME_ANCESTORS);
	const apply = (headers: Headers) => {
		if (ancestors.length > 0) applyFramePolicy(headers, ancestors);
		if (!crawl) headers.set("x-robots-tag", NOINDEX);
	};
	// Response headers can be immutable (static assets, redirects); rebuild when so.
	try {
		apply(response.headers);
		return response;
	} catch {
		const copy = new Response(response.body, response);
		apply(copy.headers);
		return copy;
	}
};
