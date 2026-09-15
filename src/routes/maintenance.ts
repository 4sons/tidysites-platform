/**
 * POST /_tidy/maintenance: run EmDash's scheduled work (scheduled publishing,
 * cleanup) now. Dispatch-namespace scripts never receive cron triggers, so the
 * control plane's cron calls this on every site instead.
 */
import { runScheduledTasks } from "emdash/middleware";
import { json } from "../lib/http";
import { methodNotAllowed, platformRoute } from "./_shared";

export const prerender = false;

export const POST = platformRoute(async (context) => {
	const started = Date.now();
	const { published } = await runScheduledTasks();
	return json({
		ok: true,
		cron: context.url.searchParams.get("cron") ?? null,
		published: published.length,
		refs: published.map((r) => ({ collection: r.collection, id: r.id })),
		ms: Date.now() - started,
		at: new Date().toISOString()
	});
});

export const ALL = methodNotAllowed("POST");
