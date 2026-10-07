/**
 * Astro middleware registered by tidyPlatform(): the framing policy from
 * TIDY_FRAME_ANCESTORS, and noindex on every page this worker serves. This
 * worker is the staging site (the live site is a static copy served by its
 * own small worker); the control plane in front of it answers robots.txt
 * and the sitemap for staging hostnames. The publish crawl identifies
 * itself and is left alone, so the live copy carries no noindex.
 */
import type { MiddlewareHandler } from "astro";
import { workerEnv } from "./lib/env";
import { applyFramePolicy, frameAncestors } from "./lib/frame";

const PUBLISH_CRAWL = "tidysites-publish";

export const onRequest: MiddlewareHandler = async (context, next) => {
	const crawl = context.request.headers.get("user-agent") === PUBLISH_CRAWL;
	const response = await next();
	const env = await workerEnv();
	const ancestors = frameAncestors(env?.TIDY_FRAME_ANCESTORS);
	if (ancestors.length === 0 && crawl) return response;
	const apply = (headers: Headers) => {
		if (ancestors.length > 0) applyFramePolicy(headers, ancestors);
		if (!crawl) headers.set("x-robots-tag", "noindex, nofollow");
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
