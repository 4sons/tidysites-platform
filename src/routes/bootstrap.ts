/** POST /_tidy/bootstrap: seed, first admin, setup complete, platform token. */
import { bootstrap, type BootstrapInput } from "../lib/handlers";
import { json, readJson } from "../lib/http";
import { methodNotAllowed, platformRoute, requestOrigin } from "./_shared";

export const prerender = false;

export const POST = platformRoute(async (context, deps) => {
	const body = await readJson<BootstrapInput>(context.request);
	return json(await bootstrap(body, deps, requestOrigin(context)));
});

export const ALL = methodNotAllowed("POST");
