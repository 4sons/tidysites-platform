/**
 * The worker env (bindings, vars, secrets), resolved from the `cloudflare:workers`
 * module at call time.
 *
 * Why not `locals.runtime.env`: the Cloudflare adapter for Astro 6+ removed it
 * and its getter throws. Why a dynamic import: EmDash probes plugin modules at
 * build time in Node, where `cloudflare:workers` does not exist, and the routes
 * must stay importable in tests.
 */
export type WorkerEnv = Record<string, unknown>;

type Importer = () => Promise<unknown>;

const defaultImporter: Importer = () => import("cloudflare:workers");

export async function workerEnv(importer: Importer = defaultImporter): Promise<WorkerEnv | undefined> {
	try {
		const mod = (await importer()) as { env?: WorkerEnv } | undefined;
		return mod?.env && typeof mod.env === "object" ? mod.env : undefined;
	} catch {
		return undefined;
	}
}

/** Alias kept for the hook plugin, which runs outside any request. */
export const hookEnv = workerEnv;
