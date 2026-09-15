/** POST /_tidy/session: mint a one-time sign-in link for a platform person. */
import { mintSession, type MintSessionInput } from "../lib/handlers";
import { json, readJson } from "../lib/http";
import { methodNotAllowed, platformRoute, requestOrigin } from "./_shared";

export const prerender = false;

export const POST = platformRoute(async (context, deps) => {
	const body = await readJson<MintSessionInput>(context.request);
	return json(await mintSession(body, deps, requestOrigin(context)));
});

export const ALL = methodNotAllowed("POST");
