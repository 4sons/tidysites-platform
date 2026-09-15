/** GET /_tidy/health: plugin version, setup state, migration status. */
import { health } from "../lib/handlers";
import { json } from "../lib/http";
import { methodNotAllowed, platformRoute } from "./_shared";

export const prerender = false;

export const GET = platformRoute(async (_context, deps) => {
	const result = await health(deps);
	return json(result, result.ok ? 200 : 503);
});

export const ALL = methodNotAllowed("GET");
