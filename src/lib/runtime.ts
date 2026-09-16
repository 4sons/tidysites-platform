/**
 * Glue between an Astro request on Cloudflare and the pure handlers: resolve
 * the worker env, build the store over EmDash's database, and provide the
 * seed and token operations from EmDash's public exports.
 *
 * This is the only file (besides src/plugin.ts) that imports EmDash. Keep it
 * that way: it is the list of things to re-verify on an EmDash upgrade.
 */
import { ContentRepository, OptionsRepository, UserRepository, applySeed, getMigrationStatus, ulid, validateSeed } from "emdash";
import { getDb } from "emdash/runtime";
import { loadSeed } from "emdash/seed";
import { VALID_SCOPES, generatePrefixedToken } from "@emdash-cms/auth";
import type { Deps } from "./handlers";
import { HttpError } from "./http";
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
	const content = new ContentRepository(db);
	const storageOpt = storage ? { storage: storage as never } : {};
	return {
		store,
		seed: {
			load: async () => (await loadSeed()) as unknown as Record<string, unknown> & { settings?: Record<string, unknown> },
			validate: (seed) => validateSeed(seed),
			apply: (seed) => applySeed(db, seed as unknown as Parameters<typeof applySeed>[1], { includeContent: true, onConflict: "skip", ...storageOpt }),
			// A content-only seed document: no collections, menus, or settings, so
			// applySeed touches nothing but entries. "update" makes it an upsert by
			// slug. applySeed replaces an existing entry's data wholesale, so fields
			// the caller did not send are carried over from the current entry first:
			// a fill names only what it knows and the template's images and blocks
			// survive underneath.
			upsertContent: async (entries) => {
				const merged: typeof entries = {};
				for (const [collection, list] of Object.entries(entries)) {
					merged[collection] = [];
					for (const e of list) {
						const slug = e.slug ?? e.id;
						const existing = slug ? await content.findBySlug(collection, slug) : null;
						const current = (existing?.data ?? {}) as Record<string, unknown>;
						merged[collection].push({ ...e, data: existing ? { ...current, ...e.data } : e.data });
					}
				}
				// The seed format's version is the string "1"; applySeed validates the
				// document first and a shape problem comes back as a 400 with the
				// validator's paths instead of a bare 500.
				const doc = { version: "1", content: merged };
				const v = validateSeed(doc);
				if (!v.valid) throw new HttpError(400, "invalid content", v.errors);
				const r = await applySeed(db, doc as unknown as Parameters<typeof applySeed>[1], { includeContent: true, onConflict: "update", ...storageOpt });
				return { created: r.content?.created ?? 0, updated: r.content?.updated ?? 0, media: r.media?.created ?? 0 };
			}
		},
		content: {
			findIdBySlug: async (collection, slug) => (await content.findBySlug(collection, slug))?.id ?? null,
			delete: (collection, id) => content.delete(collection, id)
		},
		tokens: {
			generate: () => generatePrefixedToken("ec_pat_"),
			scopes: [...VALID_SCOPES]
		}
	};
}
