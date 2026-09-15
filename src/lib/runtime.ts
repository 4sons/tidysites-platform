/**
 * Glue between an Astro request on Cloudflare and the pure handlers: resolve
 * the worker env, build the store over EmDash's database, and provide the
 * seed and token operations from EmDash's public exports.
 *
 * This is the only file (besides src/plugin.ts) that imports EmDash. Keep it
 * that way: it is the list of things to re-verify on an EmDash upgrade.
 */
import type { APIContext } from "astro";
import { OptionsRepository, UserRepository, applySeed, getMigrationStatus, ulid, validateSeed } from "emdash";
import { getDb } from "emdash/runtime";
import { loadSeed } from "emdash/seed";
import { VALID_SCOPES, generatePrefixedToken } from "@emdash-cms/auth";
import type { Deps } from "./handlers";
import { createEmdashStore } from "./store";

type Env = Record<string, unknown>;

/** The worker env: from the adapter's `locals.runtime.env`, else `cloudflare:workers`. */
export async function workerEnv(context: Pick<APIContext, "locals">): Promise<Env | undefined> {
	const fromLocals = (context.locals as { runtime?: { env?: Env } }).runtime?.env;
	if (fromLocals) return fromLocals;
	try {
		const mod = (await import("cloudflare:workers")) as unknown as { env?: Env };
		return mod.env;
	} catch {
		return undefined;
	}
}

export async function buildDeps(): Promise<Deps> {
	const db = await getDb();
	const store = createEmdashStore(db, { OptionsRepository, UserRepository, ulid, getMigrationStatus });
	return {
		store,
		seed: {
			load: async () => (await loadSeed()) as unknown as Record<string, unknown> & { settings?: Record<string, unknown> },
			validate: (seed) => validateSeed(seed),
			apply: (seed) => applySeed(db, seed as unknown as Parameters<typeof applySeed>[1], { includeContent: true, onConflict: "skip" })
		},
		tokens: {
			generate: () => generatePrefixedToken("ec_pat_"),
			scopes: [...VALID_SCOPES]
		}
	};
}
