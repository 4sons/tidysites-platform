/**
 * Route logic, free of Astro and EmDash imports. Each handler takes validated
 * JSON in and returns plain data or throws HttpError. The route modules in
 * src/routes wire real dependencies; the tests wire an in-memory store.
 */
import { HttpError, isEmail, isHttpUrl, isSafeLocalPath, randomToken, stableHash } from "./http";
import type { PlatformStore, Role } from "./store";
import { ROLE_LEVEL } from "./store";
import { VERSION } from "../version";

export interface SeedOps {
	load(): Promise<Record<string, unknown> & { settings?: Record<string, unknown> }>;
	validate(seed: unknown): { valid: boolean; errors?: unknown };
	apply(seed: Record<string, unknown>): Promise<{ collections?: unknown; content?: unknown }>;
	/**
	 * Apply only the structural parts of a seed (block types, collections and
	 * their fields, relations) to a site that is already set up, updating what
	 * exists and adding what is missing. Never touches entries, settings or menus.
	 */
	applyStructure(seed: Record<string, unknown>): Promise<Record<string, unknown>>;
	/** Upsert content entries by slug (existing entries are updated), downloading `$media` URLs into the site's storage. */
	upsertContent(content: Record<string, FillEntry[]>): Promise<{ created: number; updated: number; media: number }>;
}

export interface ContentOps {
	findIdBySlug(collection: string, slug: string): Promise<string | null>;
	delete(collection: string, id: string): Promise<boolean>;
}

export interface TokenOps {
	/** Returns the raw token to hand out and the hash to store. */
	generate(): { raw: string; hash: string; prefix: string };
	scopes: readonly string[];
}

export interface Deps {
	store: PlatformStore;
	seed: SeedOps;
	tokens: TokenOps;
	content: ContentOps;
	now?: () => number;
}

const TOKEN_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const DEFAULT_TOKEN_NAME = "platform";
const ROLES: readonly Role[] = ["admin", "editor"];
export const HANDOFF_TTL = { default: 120, min: 30, max: 600 } as const;
export const DEFAULT_REDIRECT = "/_emdash/admin";

function tokenName(value: unknown): string {
	if (value === undefined || value === null) return DEFAULT_TOKEN_NAME;
	if (typeof value !== "string" || !TOKEN_NAME.test(value)) throw new HttpError(400, "tokenName must be 1 to 64 letters, digits, - or _");
	return value;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

export interface BootstrapInput {
	adminEmail?: unknown;
	adminName?: unknown;
	title?: unknown;
	tagline?: unknown;
	siteUrl?: unknown;
	tokenName?: unknown;
}

export interface BootstrapResult {
	ok: true;
	userId: string;
	token: string;
	steps: Record<string, unknown>;
}

/** Where a running bootstrap leaves its mark, so a second call waits for it instead of running the seed beside it. */
export const BOOTSTRAP_LOCK = "tidy:bootstrap";
const BOOTSTRAP_WAIT_MS = 270_000;
const BOOTSTRAP_STALE_MS = 30 * 60_000;

/**
 * Headless first run for a freshly provisioned site: apply the template seed,
 * create the platform's admin user, mint an API token, mark setup complete.
 * Idempotent: a later call skips the seed and setup, and re-mints the token.
 *
 * The seed takes minutes on D1, longer than a caller may wait, so a caller
 * that gave up and called again used to start a second seed beside the
 * first; whichever finished last minted the token the caller never saw, and
 * the token the caller stored stopped working minutes after "done". Now the
 * first call holds a lock; a second call waits for it to finish (up to four
 * and a half minutes, then answers 409 so the caller tries again later), and
 * a first call that finds its lock taken over mints nothing. The token is
 * minted before setup is marked complete, so the call that sees "complete"
 * always mints last.
 */
export async function bootstrap(input: BootstrapInput, deps: Deps, requestOrigin: string): Promise<BootstrapResult> {
	if (!isEmail(input.adminEmail)) throw new HttpError(400, "adminEmail must be an email address");
	if (input.title !== undefined && (typeof input.title !== "string" || input.title.length > 200)) throw new HttpError(400, "title must be a string of at most 200 characters");
	if (input.tagline !== undefined && (typeof input.tagline !== "string" || input.tagline.length > 500)) throw new HttpError(400, "tagline must be a string of at most 500 characters");
	if (input.siteUrl !== undefined && !isHttpUrl(input.siteUrl)) throw new HttpError(400, "siteUrl must be an http(s) URL");
	if (input.adminName !== undefined && (typeof input.adminName !== "string" || input.adminName.length > 200)) throw new HttpError(400, "adminName must be a string of at most 200 characters");
	const name = tokenName(input.tokenName);
	const { store, seed, tokens } = deps;
	const steps: Record<string, unknown> = {};

	let alreadyComplete = (await store.getOption("emdash:setup_complete")) === true;
	const now = deps.now ?? Date.now;
	let lockId: string | null = null;
	if (!alreadyComplete) {
		const lock = (await store.getOption(BOOTSTRAP_LOCK)) as { id?: string; startedAt?: number } | null;
		if (lock?.id && typeof lock.startedAt === "number" && now() - lock.startedAt < BOOTSTRAP_STALE_MS) {
			// Another call is seeding. Wait for it; when it is through, this call mints the token the caller keeps.
			const until = now() + BOOTSTRAP_WAIT_MS;
			while (now() < until) {
				await new Promise((r) => setTimeout(r, 3000));
				if ((await store.getOption("emdash:setup_complete")) === true) break;
				const l = (await store.getOption(BOOTSTRAP_LOCK)) as { id?: string } | null;
				if (!l?.id) break;
			}
			alreadyComplete = (await store.getOption("emdash:setup_complete")) === true;
			if (!alreadyComplete) throw new HttpError(409, "bootstrap in progress; try again in a minute");
			steps.waitedFor = lock.id;
			// Take the lock over: the first call, if it is still finishing, sees that and mints nothing.
			await store.deleteOption(BOOTSTRAP_LOCK);
		} else {
			lockId = randomToken(8);
			await store.setOption(BOOTSTRAP_LOCK, { id: lockId, startedAt: now() });
		}
	}
	steps.alreadyComplete = alreadyComplete;

	if (!alreadyComplete) {
		const data = await seed.load();
		data.settings = {
			...(data.settings ?? {}),
			...(typeof input.title === "string" ? { title: input.title } : {}),
			...(typeof input.tagline === "string" ? { tagline: input.tagline } : {})
		};
		const v = seed.validate(data);
		if (!v.valid) throw new HttpError(500, "invalid seed", v.errors);
		// The structure first, as an update: a site may have been set up once
		// already by the worker it first booted on (a template's older build),
		// and the content that follows is only valid against this seed's fields.
		const structure: Record<string, unknown> = {};
		for (const k of STRUCTURE_KEYS) if (data[k] !== undefined) structure[k] = data[k];
		steps.structure = await seed.applyStructure(structure);
		const result = await seed.apply(data);
		steps.seed = { collections: result.collections, content: result.content };
	}

	let user = await store.findUserByEmail(input.adminEmail);
	if (!user) {
		user = await store.createUser({ email: input.adminEmail, name: typeof input.adminName === "string" ? input.adminName : "Platform", role: "admin" });
		steps.userCreated = true;
	} else if (user.role < ROLE_LEVEL.admin) {
		await store.setUserRole(user.id, "admin");
		steps.userPromoted = true;
	}
	await store.markEmailVerified(user.id);

	if (!alreadyComplete) {
		if (typeof input.title === "string") await store.setOption("emdash:site_title", input.title);
		if (typeof input.tagline === "string") await store.setOption("emdash:site_tagline", input.tagline);
		await store.setOptionIfAbsent("emdash:site_url", typeof input.siteUrl === "string" ? input.siteUrl : requestOrigin);
	}

	// The first call mints only while the lock is still its own: a call that waited for it has taken the lock
	// over and will mint the token its caller keeps; this call's answer was given up on long ago.
	let token = "";
	if (lockId) {
		const l = (await store.getOption(BOOTSTRAP_LOCK)) as { id?: string } | null;
		if (l?.id === lockId) {
			const t = tokens.generate();
			await store.replaceToken({ userId: user.id, name, hash: t.hash, prefix: t.prefix, scopes: [...tokens.scopes] });
			token = t.raw;
		} else steps.tokenLeftToWaiter = true;
	} else {
		const t = tokens.generate();
		await store.replaceToken({ userId: user.id, name, hash: t.hash, prefix: t.prefix, scopes: [...tokens.scopes] });
		token = t.raw;
	}
	if (!alreadyComplete) {
		await store.setOption("emdash:setup_complete", true);
		await store.deleteOption("emdash:setup_state");
	}
	if (lockId) {
		const l = (await store.getOption(BOOTSTRAP_LOCK)) as { id?: string } | null;
		if (l?.id === lockId) await store.deleteOption(BOOTSTRAP_LOCK);
	} else if (steps.waitedFor) await store.deleteOption(BOOTSTRAP_LOCK);
	return { ok: true, userId: user.id, token, steps };
}

// ---------------------------------------------------------------------------
// Schema: bring an existing site's structure up to the template's
// ---------------------------------------------------------------------------

/** The seed keys that describe structure; everything else is left out before applying. */
const STRUCTURE_KEYS = ["$schema", "version", "defaultLocale", "blockTypes", "collections", "relations"] as const;
/** Where a site remembers which structure items it has applied: { "bt:hero": "<hash>", "col:pages": "<hash>", "relations": "<hash>" }. */
export const STRUCTURE_OPTION = "tidy:structure";

export interface SchemaInput {
	/** Stop after this long and report `complete: false`; the next call carries on. Default 25 seconds. */
	budgetMs?: number;
	/** Apply every item again, whether or not it changed. */
	force?: boolean;
}

export interface SchemaResult {
	ok: true;
	/** Every changed item has been applied. False when the budget ran out first. */
	complete: boolean;
	/** Items applied on this call, in order. */
	applied: string[];
	/** Items left unchanged because the site already has this version of them. */
	unchanged: number;
	/** Items still waiting for a later call. */
	remaining: number;
	/** Counts from the seed apply, summed over this call. */
	counts: Record<string, { created: number; updated: number; skipped: number }>;
}

type StructureItem = { key: string; seed: Record<string, unknown> };

/** The structure as a list of independently applicable items: block types, then collections, then the relations as one. */
function structureItems(structure: Record<string, unknown>): StructureItem[] {
	const base: Record<string, unknown> = {};
	for (const k of ["$schema", "version", "defaultLocale"] as const) if (structure[k] !== undefined) base[k] = structure[k];
	const items: StructureItem[] = [];
	for (const bt of Array.isArray(structure.blockTypes) ? (structure.blockTypes as Array<Record<string, unknown>>) : []) items.push({ key: `bt:${String(bt.slug)}`, seed: { ...base, blockTypes: [bt] } });
	for (const col of orderCollections(Array.isArray(structure.collections) ? (structure.collections as Array<Record<string, unknown>>) : [])) items.push({ key: `col:${String(col.slug)}`, seed: { ...base, collections: [col] } });
	if (Array.isArray(structure.relations) && structure.relations.length > 0) items.push({ key: "relations", seed: { ...base, collections: structure.collections ?? [], relations: structure.relations } });
	return items;
}

/** Collections with the ones a reference field points at ahead of the ones pointing, so a new target exists before its referrer is applied; template order otherwise. */
function orderCollections(cols: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
	const bySlug = new Map(cols.map((c) => [String(c.slug), c] as const));
	const out: Array<Record<string, unknown>> = [];
	const seen = new Set<string>();
	const visit = (c: Record<string, unknown>, trail: Set<string>) => {
		const slug = String(c.slug);
		if (seen.has(slug) || trail.has(slug)) return;
		trail.add(slug);
		for (const f of Array.isArray(c.fields) ? (c.fields as Array<Record<string, unknown>>) : []) {
			const target = (f.validation as { targetCollection?: unknown } | undefined)?.targetCollection;
			if (typeof target === "string" && target !== slug && bySlug.has(target)) visit(bySlug.get(target)!, trail);
		}
		seen.add(slug);
		out.push(c);
	};
	for (const c of cols) visit(c, new Set());
	return out;
}

function addCounts(into: SchemaResult["counts"], r: Record<string, unknown>): void {
	for (const [k, v] of Object.entries(r)) {
		if (!v || typeof v !== "object") continue;
		const c = v as { created?: number; updated?: number; skipped?: number };
		const t = (into[k] ??= { created: 0, updated: 0, skipped: 0 });
		t.created += c.created ?? 0; t.updated += c.updated ?? 0; t.skipped += c.skipped ?? 0;
	}
}

/**
 * A collection's URL pattern is the site's to change (the admin's collection
 * settings; a port that wants /locations/<slug> instead of /service-areas/<slug>).
 * The template's pattern only ever lands on a collection the site does not
 * have yet: for one it has, the seed sent to EmDash carries no routing, so
 * the apply leaves the site's own in place.
 */
async function keepSiteRouting(deps: Deps, seed: Record<string, unknown>): Promise<Record<string, unknown>> {
	if (!Array.isArray(seed.collections)) return seed;
	const collections = await Promise.all((seed.collections as Array<Record<string, unknown>>).map(async (c) => {
		if (c.urlPattern === undefined && c.routable === undefined && c.hasSeo === undefined) return c;
		const existing = await deps.store.collectionRouting(String(c.slug));
		if (!existing) return c;
		const { urlPattern: _u, routable: _r, hasSeo: _s, ...rest } = c;
		return rest;
	}));
	return { ...seed, collections };
}

/**
 * Put the template seed's block types, collections, fields and relations onto
 * a bootstrapped site. Each item is hashed; one the site already holds at that
 * hash is left alone, so a deploy that changed nothing structural is one read.
 * Changed items are applied one at a time (existing definitions updated, new
 * ones created, nothing deleted) and remembered as they land, so a call cut
 * short by its budget is resumed by the next one. Entries, settings, menus,
 * taxonomies and sections are never touched. Refuses before bootstrap.
 */
export async function applySchema(deps: Deps, input: SchemaInput = {}): Promise<SchemaResult> {
	if ((await deps.store.getOption("emdash:setup_complete")) !== true) throw new HttpError(409, "site is not bootstrapped yet");
	const full = await deps.seed.load();
	const structure: Record<string, unknown> = {};
	for (const k of STRUCTURE_KEYS) if (full[k] !== undefined) structure[k] = full[k];
	const v = deps.seed.validate(structure);
	if (!v.valid) throw new HttpError(500, "invalid seed", v.errors);
	const budget = typeof input.budgetMs === "number" && input.budgetMs > 0 ? input.budgetMs : 25_000;
	const started = (deps.now ?? Date.now)();
	const known = ((await deps.store.getOption<Record<string, string>>(STRUCTURE_OPTION)) ?? {}) as Record<string, string>;
	const items = structureItems(structure);
	const hashes = await Promise.all(items.map((it) => stableHash(it.seed)));
	const pending = items.map((it, i) => ({ ...it, hash: hashes[i]! })).filter((it) => input.force === true || known[it.key] !== it.hash);
	const result: SchemaResult = { ok: true, complete: true, applied: [], unchanged: items.length - pending.length, remaining: 0, counts: {} };
	let next = { ...known };
	for (const it of pending) {
		if ((deps.now ?? Date.now)() - started > budget) { result.complete = false; break; }
		addCounts(result.counts, await deps.seed.applyStructure(await keepSiteRouting(deps, it.seed)));
		next = { ...next, [it.key]: it.hash };
		await deps.store.setOption(STRUCTURE_OPTION, next);
		result.applied.push(it.key);
	}
	result.remaining = pending.length - result.applied.length;
	return result;
}

// ---------------------------------------------------------------------------
// Fill: write real content over the template's sample content
// ---------------------------------------------------------------------------

/** One entry in the seed's content shape: `data` holds field values, `$ref:<id>` and `$media` resolve as in a template seed. */
export interface FillEntry {
	id: string;
	slug?: string | null;
	status?: "published" | "draft";
	data: Record<string, unknown>;
}

export interface FillInput {
	/** Site title and tagline; either may be omitted. */
	settings?: unknown;
	/** Entries per collection slug, upserted by slug. */
	content?: unknown;
	/** Entry slugs per collection slug to delete (sample entries the fill did not replace). Unknown slugs are ignored. */
	remove?: unknown;
}

export interface FillResult {
	ok: true;
	settings: string[];
	content: { created: number; updated: number; media: number };
	removed: number;
	missing: Array<{ collection: string; slug: string }>;
}

const COLLECTION_SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ENTRY_SLUG = /^[a-z0-9][a-z0-9_-]{0,127}$/i;
const MAX_ENTRIES = 2000;

function fillContent(value: unknown): Record<string, FillEntry[]> {
	if (value === undefined) return {};
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "content must be an object of collection slug to entry list");
	const out: Record<string, FillEntry[]> = {};
	let count = 0;
	for (const [collection, entries] of Object.entries(value as Record<string, unknown>)) {
		if (!COLLECTION_SLUG.test(collection)) throw new HttpError(400, `content: "${collection}" is not a collection slug`);
		if (!Array.isArray(entries)) throw new HttpError(400, `content.${collection} must be a list of entries`);
		out[collection] = entries.map((e, i) => {
			if (e === null || typeof e !== "object" || Array.isArray(e)) throw new HttpError(400, `content.${collection}[${i}] must be an entry object`);
			const entry = e as Record<string, unknown>;
			if (typeof entry.id !== "string" || !ENTRY_SLUG.test(entry.id)) throw new HttpError(400, `content.${collection}[${i}].id must be a slug-like id`);
			if (entry.slug !== undefined && entry.slug !== null && (typeof entry.slug !== "string" || !ENTRY_SLUG.test(entry.slug))) throw new HttpError(400, `content.${collection}[${i}].slug must be a slug`);
			if (entry.status !== undefined && entry.status !== "published" && entry.status !== "draft") throw new HttpError(400, `content.${collection}[${i}].status must be published or draft`);
			if (entry.data === null || typeof entry.data !== "object" || Array.isArray(entry.data)) throw new HttpError(400, `content.${collection}[${i}].data must be an object`);
			count++;
			return { id: entry.id, slug: entry.slug === undefined ? entry.id : (entry.slug as string | null), status: entry.status as FillEntry["status"], data: entry.data as Record<string, unknown> };
		});
	}
	if (count > MAX_ENTRIES) throw new HttpError(400, `content: at most ${MAX_ENTRIES} entries per call`);
	return out;
}

function fillRemove(value: unknown): Array<{ collection: string; slug: string }> {
	if (value === undefined) return [];
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "remove must be an object of collection slug to slug list");
	const out: Array<{ collection: string; slug: string }> = [];
	for (const [collection, slugs] of Object.entries(value as Record<string, unknown>)) {
		if (!COLLECTION_SLUG.test(collection)) throw new HttpError(400, `remove: "${collection}" is not a collection slug`);
		if (!Array.isArray(slugs) || slugs.some((x) => typeof x !== "string" || !ENTRY_SLUG.test(x))) throw new HttpError(400, `remove.${collection} must be a list of slugs`);
		for (const slug of slugs as string[]) out.push({ collection, slug });
	}
	return out;
}

/**
 * Write real content over a bootstrapped site: settings, entries upserted by
 * slug (so re-running with the same document is safe), then sample entries
 * the platform names for removal. Writes happen in that order so a removed
 * sample is never a dangling reference target for an entry written here.
 */
export async function fill(input: FillInput, deps: Deps): Promise<FillResult> {
	if (input.settings !== undefined && (input.settings === null || typeof input.settings !== "object" || Array.isArray(input.settings))) throw new HttpError(400, "settings must be an object");
	const settings = (input.settings ?? {}) as Record<string, unknown>;
	if (settings.title !== undefined && (typeof settings.title !== "string" || settings.title.length > 200)) throw new HttpError(400, "settings.title must be a string of at most 200 characters");
	if (settings.tagline !== undefined && (typeof settings.tagline !== "string" || settings.tagline.length > 500)) throw new HttpError(400, "settings.tagline must be a string of at most 500 characters");
	const content = fillContent(input.content);
	const remove = fillRemove(input.remove);
	if ((await deps.store.getOption("emdash:setup_complete")) !== true) throw new HttpError(409, "site is not bootstrapped yet");

	const applied: string[] = [];
	if (typeof settings.title === "string") {
		await deps.store.setOption("emdash:site_title", settings.title);
		applied.push("title");
	}
	if (typeof settings.tagline === "string") {
		await deps.store.setOption("emdash:site_tagline", settings.tagline);
		applied.push("tagline");
	}

	const written = Object.keys(content).length > 0 ? await deps.seed.upsertContent(content) : { created: 0, updated: 0, media: 0 };

	// Never delete something this same call just wrote.
	const kept = new Set(Object.entries(content).flatMap(([c, entries]) => entries.map((e) => `${c}/${e.slug ?? e.id}`)));
	let removed = 0;
	const missing: Array<{ collection: string; slug: string }> = [];
	for (const r of remove) {
		if (kept.has(`${r.collection}/${r.slug}`)) continue;
		const id = await deps.content.findIdBySlug(r.collection, r.slug);
		if (!id) {
			missing.push(r);
			continue;
		}
		if (await deps.content.delete(r.collection, id)) removed++;
	}
	return { ok: true, settings: applied, content: written, removed, missing };
}

// ---------------------------------------------------------------------------
// Sessions: mint a one-time handoff, then a browser claims it
// ---------------------------------------------------------------------------

export interface MintSessionInput {
	email?: unknown;
	name?: unknown;
	role?: unknown;
	redirect?: unknown;
	editMode?: unknown;
	ttlSeconds?: unknown;
}

export interface MintSessionResult {
	ok: true;
	userId: string;
	claimUrl: string;
	expiresAt: string;
}

export async function mintSession(input: MintSessionInput, deps: Deps, requestOrigin: string): Promise<MintSessionResult> {
	if (!isEmail(input.email)) throw new HttpError(400, "email must be an email address");
	if (typeof input.role !== "string" || !ROLES.includes(input.role as Role)) throw new HttpError(400, `role must be one of ${ROLES.join(", ")}`);
	const role = input.role as Role;
	if (input.name !== undefined && (typeof input.name !== "string" || input.name.length > 200)) throw new HttpError(400, "name must be a string of at most 200 characters");
	const redirect = input.redirect === undefined ? DEFAULT_REDIRECT : input.redirect;
	if (!isSafeLocalPath(redirect)) throw new HttpError(400, "redirect must be a local path starting with /");
	if (input.editMode !== undefined && typeof input.editMode !== "boolean") throw new HttpError(400, "editMode must be a boolean");
	let ttl: number = HANDOFF_TTL.default;
	if (input.ttlSeconds !== undefined) {
		if (typeof input.ttlSeconds !== "number" || !Number.isFinite(input.ttlSeconds)) throw new HttpError(400, "ttlSeconds must be a number");
		ttl = Math.min(HANDOFF_TTL.max, Math.max(HANDOFF_TTL.min, Math.floor(input.ttlSeconds)));
	}
	const now = (deps.now ?? Date.now)();
	const { store } = deps;

	let user = await store.findUserByEmail(input.email);
	if (!user) {
		user = await store.createUser({ email: input.email, name: typeof input.name === "string" ? input.name : input.email, role });
		await store.markEmailVerified(user.id);
	} else {
		if (user.disabled) throw new HttpError(403, "this user is disabled on the site");
		if (user.role !== ROLE_LEVEL[role]) await store.setUserRole(user.id, role);
	}

	await store.sweepHandoffs(now);
	const token = randomToken(32);
	const expiresAt = now + ttl * 1000;
	await store.putHandoff(token, { userId: user.id, redirect, editMode: input.editMode === true, expiresAt });
	return {
		ok: true,
		userId: user.id,
		claimUrl: `${requestOrigin}/_tidy/session/claim?t=${encodeURIComponent(token)}`,
		expiresAt: new Date(expiresAt).toISOString()
	};
}

export type ClaimResult = { kind: "redirect"; userId: string; redirect: string; editMode: boolean } | { kind: "expired" } | { kind: "invalid" };

export async function claimSession(token: unknown, deps: Deps): Promise<ClaimResult> {
	if (typeof token !== "string" || token.length < 16 || token.length > 128 || !/^[A-Za-z0-9_-]+$/.test(token)) return { kind: "invalid" };
	const handoff = await deps.store.takeHandoff(token);
	if (!handoff) return { kind: "invalid" };
	const now = (deps.now ?? Date.now)();
	if (handoff.expiresAt <= now) return { kind: "expired" };
	const user = await deps.store.findUserById(handoff.userId);
	if (!user || user.disabled) return { kind: "invalid" };
	if (!isSafeLocalPath(handoff.redirect)) return { kind: "invalid" };
	return { kind: "redirect", userId: user.id, redirect: handoff.redirect, editMode: handoff.editMode };
}

// ---------------------------------------------------------------------------
// Token rotation
// ---------------------------------------------------------------------------

export interface RotateTokenInput {
	email?: unknown;
	tokenName?: unknown;
}

export async function rotateToken(input: RotateTokenInput, deps: Deps): Promise<{ ok: true; userId: string; token: string }> {
	const name = tokenName(input.tokenName);
	const { store, tokens } = deps;
	let userId: string | null = null;
	if (input.email !== undefined) {
		if (!isEmail(input.email)) throw new HttpError(400, "email must be an email address");
		const user = await store.findUserByEmail(input.email);
		if (!user) throw new HttpError(404, "no user with that email");
		userId = user.id;
	} else {
		userId = await store.findTokenOwner(name);
		if (!userId) throw new HttpError(404, `no token named ${name} exists; pass email to create one`);
	}
	const t = tokens.generate();
	await store.replaceToken({ userId, name, hash: t.hash, prefix: t.prefix, scopes: [...tokens.scopes] });
	return { ok: true, userId, token: t.raw };
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface HealthResult {
	ok: boolean;
	plugin: string;
	setupComplete: boolean;
	siteTitle: string | null;
	siteUrl: string | null;
	migrations: { applied: number; pending: number };
	time: string;
}

export async function health(deps: Deps): Promise<HealthResult> {
	const { store } = deps;
	const [setupComplete, siteTitle, siteUrl, migrations] = await Promise.all([
		store.getOption("emdash:setup_complete"),
		store.getOption<string>("emdash:site_title"),
		store.getOption<string>("emdash:site_url"),
		store.migrationStatus()
	]);
	return {
		ok: migrations.pending === 0,
		plugin: VERSION,
		setupComplete: setupComplete === true,
		siteTitle: siteTitle ?? null,
		siteUrl: siteUrl ?? null,
		migrations,
		time: new Date((deps.now ?? Date.now)()).toISOString()
	};
}
