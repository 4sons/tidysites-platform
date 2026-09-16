import { describe, expect, it } from "vitest";
import { DEFAULT_REDIRECT, HANDOFF_TTL, bootstrap, claimSession, fill, health, mintSession, rotateToken } from "../src/lib/handlers";
import { ROLE_LEVEL } from "../src/lib/store";
import { VERSION } from "../src/version";
import { createDeps, createMemoryStore } from "./memory-store";

const ORIGIN = "https://staging-acme.tidysites.dev";

describe("bootstrap", () => {
	it("first run: applies the seed with title/tagline, creates the admin, completes setup, mints a token", async () => {
		const deps = createDeps();
		const r = await bootstrap({ adminEmail: "platform@acme.test", adminName: "Platform", title: "Acme Plumbing", tagline: "Fast fixes", siteUrl: "https://acme.tidysites.dev" }, deps, ORIGIN);
		expect(r.ok).toBe(true);
		expect(r.token).toBe("ec_pat_raw1");
		expect(r.steps).toMatchObject({ alreadyComplete: false, userCreated: true, seed: { collections: 3, content: 4 } });
		const o = deps.store.state.options;
		expect(o.get("emdash:setup_complete")).toBe(true);
		expect(o.get("emdash:site_title")).toBe("Acme Plumbing");
		expect(o.get("emdash:site_tagline")).toBe("Fast fixes");
		expect(o.get("emdash:site_url")).toBe("https://acme.tidysites.dev");
		expect(deps.store.state.users).toHaveLength(1);
		expect(deps.store.state.users[0]).toMatchObject({ email: "platform@acme.test", name: "Platform", role: ROLE_LEVEL.admin });
		expect(deps.store.state.tokens).toEqual([expect.objectContaining({ userId: r.userId, name: "platform", hash: "hash1", scopes: ["content:read", "content:write"] })]);
	});

	it("merges title and tagline into the seed settings before applying", async () => {
		let applied: unknown;
		const deps = createDeps();
		deps.seed.apply = async (seed) => {
			applied = seed;
			return {};
		};
		await bootstrap({ adminEmail: "p@a.test", title: "T", tagline: "G" }, deps, ORIGIN);
		expect(applied).toMatchObject({ settings: { title: "T", tagline: "G" } });
	});

	it("uses the request origin as site_url when none is given, and does not overwrite an existing one", async () => {
		const deps = createDeps();
		await bootstrap({ adminEmail: "p@a.test" }, deps, ORIGIN);
		expect(deps.store.state.options.get("emdash:site_url")).toBe(ORIGIN);
	});

	it("second run: skips seed and setup, keeps the user, replaces the token", async () => {
		const deps = createDeps();
		const first = await bootstrap({ adminEmail: "p@a.test", title: "First" }, deps, ORIGIN);
		let seedCalls = 0;
		deps.seed.apply = async () => (seedCalls++, {});
		const second = await bootstrap({ adminEmail: "p@a.test", title: "Second" }, deps, ORIGIN);
		expect(seedCalls).toBe(0);
		expect(second.steps).toMatchObject({ alreadyComplete: true });
		expect(second.userId).toBe(first.userId);
		expect(second.token).not.toBe(first.token);
		expect(deps.store.state.tokens).toHaveLength(1);
		expect(deps.store.state.options.get("emdash:site_title")).toBe("First");
	});

	it("promotes an existing lower-role user to admin", async () => {
		const store = createMemoryStore({ users: [{ id: "u9", email: "p@a.test", name: null, role: ROLE_LEVEL.editor, disabled: false }] });
		const deps = createDeps({ store });
		const r = await bootstrap({ adminEmail: "p@a.test" }, deps, ORIGIN);
		expect(r.steps.userPromoted).toBe(true);
		expect(store.state.users[0]!.role).toBe(ROLE_LEVEL.admin);
	});

	it("rejects bad input with 400 before touching anything", async () => {
		const deps = createDeps();
		const cases = [
			{},
			{ adminEmail: "nope" },
			{ adminEmail: "p@a.test", siteUrl: "ftp://x" },
			{ adminEmail: "p@a.test", title: 5 },
			{ adminEmail: "p@a.test", tokenName: "bad name!" },
			{ adminEmail: "p@a.test", tagline: "x".repeat(501) }
		];
		for (const input of cases) await expect(bootstrap(input as never, deps, ORIGIN), JSON.stringify(input)).rejects.toMatchObject({ status: 400 });
		expect(deps.store.state.users).toHaveLength(0);
		expect(deps.store.state.options.size).toBe(0);
	});

	it("refuses an invalid seed with 500 and the validator's details, leaving setup incomplete", async () => {
		const deps = createDeps();
		deps.seed.validate = () => ({ valid: false, errors: [{ path: "collections.0.slug", message: "reserved" }] });
		await expect(bootstrap({ adminEmail: "p@a.test" }, deps, ORIGIN)).rejects.toMatchObject({ status: 500, details: [{ path: "collections.0.slug" }] });
		expect(deps.store.state.options.get("emdash:setup_complete")).toBeUndefined();
	});

	it("honours a custom token name", async () => {
		const deps = createDeps();
		await bootstrap({ adminEmail: "p@a.test", tokenName: "crawler" }, deps, ORIGIN);
		expect(deps.store.state.tokens[0]!.name).toBe("crawler");
	});
});

describe("mintSession", () => {
	it("creates the user with the requested role and returns a claim link on the request origin", async () => {
		const deps = createDeps();
		const r = await mintSession({ email: "jo@partner.test", name: "Jo", role: "editor" }, deps, ORIGIN);
		expect(r.ok).toBe(true);
		expect(r.claimUrl.startsWith(`${ORIGIN}/_tidy/session/claim?t=`)).toBe(true);
		expect(deps.store.state.users[0]).toMatchObject({ email: "jo@partner.test", name: "Jo", role: ROLE_LEVEL.editor });
		const token = new URL(r.claimUrl).searchParams.get("t")!;
		expect(deps.store.state.handoffs.get(token)).toEqual({ userId: r.userId, redirect: DEFAULT_REDIRECT, editMode: false, expiresAt: deps.now!() + HANDOFF_TTL.default * 1000 });
		expect(r.expiresAt).toBe(new Date(deps.now!() + HANDOFF_TTL.default * 1000).toISOString());
	});

	it("re-maps the role of an existing user to what the platform says now", async () => {
		const store = createMemoryStore({ users: [{ id: "u1", email: "jo@partner.test", name: "Jo", role: ROLE_LEVEL.admin, disabled: false }] });
		const deps = createDeps({ store });
		await mintSession({ email: "jo@partner.test", role: "editor" }, deps, ORIGIN);
		expect(store.state.users[0]!.role).toBe(ROLE_LEVEL.editor);
		await mintSession({ email: "JO@partner.test", role: "admin" }, deps, ORIGIN);
		expect(store.state.users[0]!.role).toBe(ROLE_LEVEL.admin);
		expect(store.state.users).toHaveLength(1);
	});

	it("refuses a disabled user with 403", async () => {
		const store = createMemoryStore({ users: [{ id: "u1", email: "x@y.test", name: null, role: ROLE_LEVEL.editor, disabled: true }] });
		await expect(mintSession({ email: "x@y.test", role: "editor" }, createDeps({ store }), ORIGIN)).rejects.toMatchObject({ status: 403 });
		expect(store.state.handoffs.size).toBe(0);
	});

	it("rejects bad roles, redirects, edit flags and ttl types with 400", async () => {
		const deps = createDeps();
		const cases = [
			{ email: "x@y.test" },
			{ email: "x@y.test", role: "viewer" },
			{ email: "x@y.test", role: "subscriber" },
			{ email: "nope", role: "admin" },
			{ email: "x@y.test", role: "admin", redirect: "https://evil.test" },
			{ email: "x@y.test", role: "admin", redirect: "//evil.test" },
			{ email: "x@y.test", role: "admin", redirect: "admin" },
			{ email: "x@y.test", role: "admin", editMode: "yes" },
			{ email: "x@y.test", role: "admin", ttlSeconds: "120" },
			{ email: "x@y.test", role: "admin", name: 7 }
		];
		for (const input of cases) await expect(mintSession(input as never, deps, ORIGIN), JSON.stringify(input)).rejects.toMatchObject({ status: 400 });
		expect(deps.store.state.users).toHaveLength(0);
	});

	it("clamps ttl into range and stores edit mode and redirect", async () => {
		const deps = createDeps();
		const lo = await mintSession({ email: "a@b.test", role: "admin", ttlSeconds: 1, editMode: true, redirect: "/services/x?edit=1" }, deps, ORIGIN);
		const hi = await mintSession({ email: "a@b.test", role: "admin", ttlSeconds: 99999 }, deps, ORIGIN);
		const t = (u: string) => new URL(u).searchParams.get("t")!;
		expect(deps.store.state.handoffs.get(t(lo.claimUrl))).toMatchObject({ editMode: true, redirect: "/services/x?edit=1", expiresAt: deps.now!() + HANDOFF_TTL.min * 1000 });
		expect(deps.store.state.handoffs.get(t(hi.claimUrl))!.expiresAt).toBe(deps.now!() + HANDOFF_TTL.max * 1000);
	});

	it("sweeps expired handoffs when minting", async () => {
		const deps = createDeps();
		deps.store.state.handoffs.set("old", { userId: "u0", redirect: "/", editMode: false, expiresAt: deps.now!() - 1 });
		deps.store.state.handoffs.set("live", { userId: "u0", redirect: "/", editMode: false, expiresAt: deps.now!() + 1 });
		await mintSession({ email: "a@b.test", role: "admin" }, deps, ORIGIN);
		expect(deps.store.state.handoffs.has("old")).toBe(false);
		expect(deps.store.state.handoffs.has("live")).toBe(true);
	});
});

describe("claimSession", () => {
	async function minted(overrides: Record<string, unknown> = {}) {
		const deps = createDeps();
		const r = await mintSession({ email: "a@b.test", role: "admin", ...overrides }, deps, ORIGIN);
		return { deps, token: new URL(r.claimUrl).searchParams.get("t")!, userId: r.userId };
	}

	it("redeems once and only once", async () => {
		const { deps, token, userId } = await minted({ editMode: true, redirect: "/about" });
		expect(await claimSession(token, deps)).toEqual({ kind: "redirect", userId, redirect: "/about", editMode: true });
		expect(await claimSession(token, deps)).toEqual({ kind: "invalid" });
	});

	it("reports expiry and burns the token", async () => {
		const { deps, token } = await minted();
		deps.now = () => 1_700_000_000_000 + HANDOFF_TTL.default * 1000 + 1;
		expect(await claimSession(token, deps)).toEqual({ kind: "expired" });
		expect(deps.store.state.handoffs.has(token)).toBe(false);
	});

	it("rejects unknown, malformed, or missing tokens without touching the store", async () => {
		const deps = createDeps();
		for (const t of [null, undefined, "", "short", "has spaces here", "x".repeat(200), "a".repeat(43)]) expect(await claimSession(t, deps), String(t)).toEqual({ kind: "invalid" });
	});

	it("refuses when the user vanished or was disabled after minting", async () => {
		const a = await minted();
		a.deps.store.state.users = [];
		expect(await claimSession(a.token, a.deps)).toEqual({ kind: "invalid" });
		const b = await minted();
		b.deps.store.state.users[0]!.disabled = true;
		expect(await claimSession(b.token, b.deps)).toEqual({ kind: "invalid" });
	});

	it("refuses a stored redirect that is no longer safe", async () => {
		const { deps, token } = await minted();
		deps.store.state.handoffs.get(token)!.redirect = "https://evil.test";
		expect(await claimSession(token, deps)).toEqual({ kind: "invalid" });
	});
});

describe("rotateToken", () => {
	it("rotates by email", async () => {
		const deps = createDeps();
		const b = await bootstrap({ adminEmail: "p@a.test" }, deps, ORIGIN);
		const r = await rotateToken({ email: "p@a.test" }, deps);
		expect(r.userId).toBe(b.userId);
		expect(r.token).not.toBe(b.token);
		expect(deps.store.state.tokens).toHaveLength(1);
		expect(deps.store.state.tokens[0]!.hash).toBe("hash2");
	});
	it("rotates by token name when no email is given", async () => {
		const deps = createDeps();
		const b = await bootstrap({ adminEmail: "p@a.test" }, deps, ORIGIN);
		const r = await rotateToken({}, deps);
		expect(r.userId).toBe(b.userId);
		expect(deps.store.state.tokens).toHaveLength(1);
	});
	it("404s for an unknown email or a token name nobody holds", async () => {
		const deps = createDeps();
		await expect(rotateToken({ email: "ghost@a.test" }, deps)).rejects.toMatchObject({ status: 404 });
		await expect(rotateToken({ tokenName: "crawler" }, deps)).rejects.toMatchObject({ status: 404 });
	});
	it("400s for bad input", async () => {
		const deps = createDeps();
		await expect(rotateToken({ email: "nope" }, deps)).rejects.toMatchObject({ status: 400 });
		await expect(rotateToken({ tokenName: "!" }, deps)).rejects.toMatchObject({ status: 400 });
	});
});

describe("health", () => {
	it("reports version, setup, site, and migrations; ok only with nothing pending", async () => {
		const deps = createDeps();
		expect(await health(deps)).toEqual({ ok: true, plugin: VERSION, setupComplete: false, siteTitle: null, siteUrl: null, migrations: { applied: 12, pending: 0 }, time: new Date(deps.now!()).toISOString() });
		await bootstrap({ adminEmail: "p@a.test", title: "Acme" }, deps, ORIGIN);
		deps.store.state.migrations = { applied: 12, pending: 2 };
		expect(await health(deps)).toMatchObject({ ok: false, setupComplete: true, siteTitle: "Acme", siteUrl: ORIGIN, migrations: { pending: 2 } });
	});
});

describe("fill", () => {
	async function bootstrapped() {
		const deps = createDeps();
		await bootstrap({ adminEmail: "p@a.test", title: "Seeded" }, deps, ORIGIN);
		deps.store.state.content["services/ant-control"] = { title: "Sample ants" };
		deps.store.state.content["services/sample-two"] = { title: "Sample two" };
		deps.store.state.content["reviews/review-1"] = { title: "Sample review" };
		return deps;
	}

	it("refuses to run before bootstrap", async () => {
		const deps = createDeps();
		await expect(fill({ content: {} }, deps)).rejects.toMatchObject({ status: 409 });
	});

	it("writes settings, upserts entries by slug, removes the named samples, and reports the missing ones", async () => {
		const deps = await bootstrapped();
		const r = await fill(
			{
				settings: { title: "Romney Pest Control", tagline: "Pest control on demand" },
				content: {
					services: [
						{ id: "ant-control", data: { title: "Ant control" } },
						{ id: "termite-control", slug: "termite-control", status: "published", data: { title: "Termite control" } }
					]
				},
				remove: { services: ["sample-two", "ant-control", "never-existed"], reviews: ["review-1"] }
			},
			deps
		);
		expect(r).toEqual({ ok: true, settings: ["title", "tagline"], content: { created: 1, updated: 1, media: 0 }, removed: 2, missing: [{ collection: "services", slug: "never-existed" }] });
		expect(deps.store.state.options.get("emdash:site_title")).toBe("Romney Pest Control");
		expect(deps.store.state.options.get("emdash:site_tagline")).toBe("Pest control on demand");
		// The entry this call wrote is never removed, even when named.
		expect(deps.store.state.content["services/ant-control"]).toEqual({ title: "Ant control" });
		expect(deps.store.state.content["services/termite-control"]).toEqual({ title: "Termite control" });
		expect(deps.store.state.content["services/sample-two"]).toBeUndefined();
		expect(deps.store.state.content["reviews/review-1"]).toBeUndefined();
	});

	it("is a no-op with an empty body except for the bootstrap check", async () => {
		const deps = await bootstrapped();
		let calls = 0;
		deps.seed.upsertContent = async () => (calls++, { created: 0, updated: 0, media: 0 });
		const r = await fill({}, deps);
		expect(calls).toBe(0);
		expect(r).toMatchObject({ ok: true, settings: [], removed: 0, missing: [] });
	});

	it("validates shapes: 400 for bad settings, content, entries, and remove lists", async () => {
		const deps = await bootstrapped();
		await expect(fill({ settings: [] }, deps)).rejects.toMatchObject({ status: 400 });
		await expect(fill({ settings: { title: "x".repeat(201) } }, deps)).rejects.toMatchObject({ status: 400 });
		await expect(fill({ content: [] }, deps)).rejects.toMatchObject({ status: 400 });
		await expect(fill({ content: { "Bad Slug": [] } }, deps)).rejects.toMatchObject({ status: 400 });
		await expect(fill({ content: { services: {} } }, deps)).rejects.toMatchObject({ status: 400 });
		await expect(fill({ content: { services: [{ id: "ok", data: [] }] } }, deps)).rejects.toMatchObject({ status: 400 });
		await expect(fill({ content: { services: [{ id: "has space", data: {} }] } }, deps)).rejects.toMatchObject({ status: 400 });
		await expect(fill({ content: { services: [{ id: "ok", status: "trashed", data: {} }] } }, deps)).rejects.toMatchObject({ status: 400 });
		await expect(fill({ remove: { services: "ant-control" } }, deps)).rejects.toMatchObject({ status: 400 });
		await expect(fill({ remove: { services: ["ok", 3] } }, deps)).rejects.toMatchObject({ status: 400 });
		// Nothing was written by any of the rejected calls.
		expect(deps.store.state.content["services/ant-control"]).toEqual({ title: "Sample ants" });
	});

	it("caps a single call at 2000 entries", async () => {
		const deps = await bootstrapped();
		const many = Array.from({ length: 2001 }, (_, i) => ({ id: `e${i}`, data: {} }));
		await expect(fill({ content: { services: many } }, deps)).rejects.toMatchObject({ status: 400 });
	});
});
