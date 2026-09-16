/** Astro middleware registered by tidyPlatform(): the framing policy from TIDY_FRAME_ANCESTORS. */
import type { MiddlewareHandler } from "astro";
import { workerEnv } from "./lib/env";
import { applyFramePolicy, frameAncestors } from "./lib/frame";

export const onRequest: MiddlewareHandler = async (_context, next) => {
	const response = await next();
	const env = await workerEnv();
	const ancestors = frameAncestors(env?.TIDY_FRAME_ANCESTORS);
	if (ancestors.length === 0) return response;
	// Response headers can be immutable (static assets, redirects); rebuild when so.
	try {
		applyFramePolicy(response.headers, ancestors);
		return response;
	} catch {
		const copy = new Response(response.body, response);
		applyFramePolicy(copy.headers, ancestors);
		return copy;
	}
};
