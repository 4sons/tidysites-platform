/** POST /_tidy/rotate-token: replace the platform API token. */
import { rotateToken, type RotateTokenInput } from "../lib/handlers";
import { json, readJson } from "../lib/http";
import { methodNotAllowed, platformRoute } from "./_shared";

export const prerender = false;

export const POST = platformRoute(async (context, deps) => {
	const body = await readJson<RotateTokenInput>(context.request);
	return json(await rotateToken(body, deps));
});

export const ALL = methodNotAllowed("POST");
