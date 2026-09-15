/**
 * Route logic, free of Astro and EmDash imports. Each handler takes validated
 * JSON in and returns plain data or throws HttpError. The route modules in
 * src/routes wire real dependencies; the tests wire an in-memory store.
 */
import { HttpError, isEmail, isHttpUrl, isSafeLocalPath, randomToken } from "./http";
import type { PlatformStore, Role } from "./store";
import { ROLE_LEVEL } from "./store";
import { VERSION } from "../version";

export interface SeedOps {
	load(): Promise<Record<string, unknown> & { settings?: Record<string, unknown> }>;
	validate(seed: unknown): { valid: boolean; errors?: unknown };
	apply(seed: Record<string, unknown>): Promise<{ collections?: unknown; content?: unknown }>;
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

/**
 * Headless first run for a freshly provisioned site: apply the template seed,
 * create the platform's admin user, mark setup complete, mint an API token.
 * Idempotent: a later call skips the seed and setup, and re-mints the token.
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

	const alreadyComplete = (await store.getOption("emdash:setup_complete")) === true;
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
		await store.setOption("emdash:setup_complete", true);
		await store.deleteOption("emdash:setup_state");
	}

	const t = tokens.generate();
	await store.replaceToken({ userId: user.id, name, hash: t.hash, prefix: t.prefix, scopes: [...tokens.scopes] });
	return { ok: true, userId: user.id, token: t.raw, steps };
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
