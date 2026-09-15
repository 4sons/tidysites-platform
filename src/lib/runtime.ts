/**
 * Glue between an Astro request on Cloudflare and the pure handlers: resolve
 * the worker env, build the store over EmDash's database, and provide the
 * seed and token operations from EmDash's public exports.
 *
 * This is the only file (besides src/plugin.ts) that imports EmDash. Keep it
 * that way: it is the list of things to re-verify on an EmDash upgrade.
 */
import { OptionsRepository, UserRepository, applySeed, getMigrationStatus, ulid, validateSeed } from "emdash";
import { getDb } from "emdash/runtime";
import { loadSeed } from "emdash/seed";
import { VALID_SCOPES, generatePrefixedToken } from "@emdash-cms/auth";
import type { Deps } from "./handlers";
import { createEmdashStore } from "./store";

export { workerEnv } from "./env";

/**
 * The site's configured storage (R2 on Cloudflare), built the same way
 * EmDash's setup wizard builds it: from the virtual config and storage
 * modules the EmDash integration generates at build time. Without it,
 * `applySeed` skips every `$media` reference in the seed.
 */
async function storageProvider(): Promise<unknown> {
	try {
		const [cfgMod, storageMod] = await Promise.all([
			import("virtual:emdash/config") as Promise<{ default?: { storage?: { config?: unknown } } }>,
			import("virtual:emdash/storage") as Promise<{ createStorage?: (config: unknown) => unknown }>
		]);
		const storageConfig = cfgMod.default?.storage;
		if (!storageConfig || typeof storageMod.createStorage !== "function") return undefined;
		return storageMod.createStorage(storageConfig.config);
	} catch {
		return undefined;
	}
}

export async function buildDeps(): Promise<Deps> {
	const [db, storage] = await Promise.all([getDb(), storageProvider()]);
	const store = createEmdashStore(db, { OptionsRepository, UserRepository, ulid, getMigrationStatus });
	return {
		store,
		seed: {
			load: async () => (await loadSeed()) as unknown as Record<string, unknown> & { settings?: Record<string, unknown> },
			validate: (seed) => validateSeed(seed),
			apply: (seed) => applySeed(db, seed as unknown as Parameters<typeof applySeed>[1], { includeContent: true, onConflict: "skip", ...(storage ? { storage: storage as never } : {}) })
		},
		tokens: {
			generate: () => generatePrefixedToken("ec_pat_"),
			scopes: [...VALID_SCOPES]
		}
	};
}
