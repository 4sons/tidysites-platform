/** POST /_tidy/fill: real content over the template's sample content. */
import { fill, type FillInput } from "../lib/handlers";
import { json, readJson } from "../lib/http";
import { methodNotAllowed, platformRoute } from "./_shared";

export const prerender = false;

export const POST = platformRoute(async (context, deps) => {
	const body = await readJson<FillInput>(context.request);
	return json(await fill(body, deps));
});

export const ALL = methodNotAllowed("POST");
