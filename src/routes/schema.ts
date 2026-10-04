/** POST /_tidy/schema: the template's block types, collections and fields onto an existing site. */
import { applySchema } from "../lib/handlers";
import { json } from "../lib/http";
import { methodNotAllowed, platformRoute } from "./_shared";

export const prerender = false;

export const POST = platformRoute(async (_context, deps) => json(await applySchema(deps)));

export const ALL = methodNotAllowed("POST");
