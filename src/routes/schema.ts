/**
 * POST /_tidy/schema: the template's block types, collections and fields onto
 * an existing site. Only items that changed since the last apply are written,
 * one at a time, within a time budget; `complete: false` means call again.
 *   ?budgetMs=25000   how long to work before answering (default 25 seconds)
 *   ?force=1          apply every item whether or not it changed
 */
import { applySchema } from "../lib/handlers";
import { json } from "../lib/http";
import { methodNotAllowed, platformRoute } from "./_shared";

export const prerender = false;

export const POST = platformRoute(async (context, deps) => {
	const q = new URL(context.request.url).searchParams;
	const budget = Number(q.get("budgetMs"));
	return json(await applySchema(deps, { budgetMs: Number.isFinite(budget) && budget > 0 ? budget : undefined, force: q.get("force") === "1" }));
});

export const ALL = methodNotAllowed("POST");
