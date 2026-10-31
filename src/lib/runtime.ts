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

/** Mend a stored repeater whose sub-field type the store no longer accepts, named by the error's path (validation.subFields[i].type): that sub-field becomes an image. True when something was mended. */
export async function repairUnsupportedSubField(db: unknown, err: unknown): Promise<boolean> {
	const msg = err instanceof Error ? err.message : String(err);
	const m = /Field "([^"]+)" in collection "([^"]+)" uses unsupported field type "([^"]+)" at "validation\.subFields\[(\d+)\]\.type"/.exec(msg);
	if (!m) return false;
	const [, fieldSlug, collectionSlug, , index] = m;
	const k = db as { selectFrom: (t: string) => any; updateTable: (t: string) => any };
	const row = await k.selectFrom("_emdash_fields as field").innerJoin("_emdash_collections as collection", "collection.id", "field.collection_id").select(["field.id as id", "field.validation as validation"]).where("collection.slug", "=", collectionSlug).where("field.slug", "=", fieldSlug).executeTakeFirst();
	if (!row?.id) return false;
	let validation: { subFields?: Array<{ type?: string }> };
	try { validation = typeof row.validation === "string" ? JSON.parse(row.validation) : row.validation ?? {}; } catch { return false; }
	const sub = validation.subFields?.[Number(index)];
	if (!sub) return false;
	sub.type = "image";
	await k.updateTable("_emdash_fields").set({ validation: JSON.stringify(validation) }).where("id", "=", row.id).execute();
	return true;
}

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
			// Structure only: "update" rewrites an existing collection's definition
			// and upserts its fields (never deletes one), adds missing block types
			// and amends compatible block versions. The caller has already stripped
			// content, settings and menus from the document.
			applyStructure: async (seed) => {
				const run = async () => (await applySeed(db, seed as unknown as Parameters<typeof applySeed>[1], { includeContent: false, onConflict: "update" })) as unknown as Record<string, unknown>;
				let r: Record<string, unknown>;
				try {
					r = await run();
				} catch (err) {
					// A field the store created in an earlier release with a sub-field type it no longer allows (a `file` inside a
					// repeater, templates 0.30.0 to 0.30.2) refuses every update until its stored shape is mended: the offending
					// sub-field becomes an image in the stored definition, then the seed's definition is applied over it.
					if (!(await repairUnsupportedSubField(db, err))) throw err;
					r = await run();
				}
				const pick = (k: string) => (r[k] !== undefined ? { [k]: r[k] } : {});
				return { ...pick("blockTypes"), ...pick("collections"), ...pick("fields"), ...pick("relations") };
			},
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
						// A push clears a field by sending null; for a list the entry holds (sections, items) the cleared value is
						// an empty list, which is what the store takes. Null there failed the write with a bare internal error.
						const data: Record<string, unknown> = existing ? { ...current, ...e.data } : { ...e.data };
						for (const [k, v] of Object.entries(data)) if (v === null && Array.isArray(current[k])) data[k] = [];
						merged[collection].push({ ...e, data });
					}
				}
				// The seed format's version is the string "1"; applySeed validates the
				// document first and a shape problem comes back as a 400 with the
				// validator's paths instead of a bare 500.
				const doc = { version: "1", content: merged };
				const v = validateSeed(doc);
				if (!v.valid) throw new HttpError(400, "invalid content", v.errors);
				let r: Awaited<ReturnType<typeof applySeed>>;
				try {
					r = await applySeed(db, doc as unknown as Parameters<typeof applySeed>[1], { includeContent: true, onConflict: "update", ...storageOpt });
				} catch (err) {
					// The store's own words reach the pusher (which entry, which value), instead of "internal error".
					if (err instanceof HttpError) throw err;
					throw new HttpError(400, `the website could not store the content: ${err instanceof Error ? err.message : String(err)}`);
				}
				// applySeed stamps every published entry with now; a pushed `post_date` (a post's real date) is written over it.
				const docContent = (doc as { content?: Record<string, Array<{ id?: unknown; slug?: unknown; data?: Record<string, unknown> }>> }).content ?? {};
				for (const [collection, entries] of Object.entries(docContent)) {
					for (const e of entries) {
						const when = typeof e.data?.post_date === "string" ? new Date(e.data.post_date) : null;
						if (!when || Number.isNaN(when.getTime())) continue;
						// By slug first: a pushed entry's id may be its slug standing in as the seed key, not a stored id.
						const id = (typeof e.slug === "string" && e.slug ? (await content.findBySlug(collection, e.slug))?.id : null) ?? (typeof e.id === "string" && e.id ? e.id : null);
						if (id) await content.update(collection, id, { publishedAt: when } as never).catch(() => undefined);
					}
				}
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
