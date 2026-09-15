import type { APIContext, APIRoute } from "astro";
import { gate } from "../lib/auth";
import { errorResponse } from "../lib/http";
import { buildDeps, workerEnv } from "../lib/runtime";
import type { Deps } from "../lib/handlers";

/**
 * Wrap a platform route: resolve env, apply the secret gate, build deps, and
 * turn thrown HttpErrors into JSON. `requireBearer: false` only for the
 * browser-facing session claim.
 */
export function platformRoute(
	handler: (context: APIContext, deps: Deps, env: Record<string, unknown>) => Promise<Response>,
	options: { requireBearer?: boolean } = {}
): APIRoute {
	return async (context) => {
		const env = await workerEnv();
		const g = gate(context.request, env, options.requireBearer ?? true);
		if (!g.ok) return g.response;
		try {
			const deps = await buildDeps();
			return await handler(context, deps, env!);
		} catch (err) {
			return errorResponse(err);
		}
	};
}

export function methodNotAllowed(allow: string): APIRoute {
	return () => new Response("Method not allowed", { status: 405, headers: { allow } });
}

export function requestOrigin(context: APIContext): string {
	return new URL(context.request.url).origin;
}
