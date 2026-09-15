import { describe, expect, it } from "vitest";
import { bearerToken, gate, secretMatches } from "../src/lib/auth";

const req = (auth?: string) => new Request("https://site.test/_tidy/health", auth ? { headers: { authorization: auth } } : {});

describe("bearerToken", () => {
	it("reads a Bearer header case-insensitively and trims", () => {
		expect(bearerToken(req("Bearer abc"))).toBe("abc");
		expect(bearerToken(req("bearer   abc  "))).toBe("abc");
	});
	it("returns null for missing, empty, or other schemes", () => {
		expect(bearerToken(req())).toBeNull();
		expect(bearerToken(req("Bearer "))).toBeNull();
		expect(bearerToken(req("Basic abc"))).toBeNull();
		expect(bearerToken(req("abc"))).toBeNull();
	});
});

describe("secretMatches", () => {
	it("matches identical strings", () => {
		expect(secretMatches("s3cret-value", "s3cret-value")).toBe(true);
	});
	it("rejects different strings, prefixes, and different lengths", () => {
		expect(secretMatches("s3cret-value", "s3cret-valuX")).toBe(false);
		expect(secretMatches("s3cret", "s3cret-value")).toBe(false);
		expect(secretMatches("s3cret-value-longer", "s3cret-value")).toBe(false);
	});
	it("rejects empty and missing values on either side", () => {
		expect(secretMatches("", "x")).toBe(false);
		expect(secretMatches("x", "")).toBe(false);
		expect(secretMatches(null, "x")).toBe(false);
		expect(secretMatches("x", undefined)).toBe(false);
		expect(secretMatches("", "")).toBe(false);
	});
	it("handles multi-byte characters", () => {
		expect(secretMatches("pässwörd", "pässwörd")).toBe(true);
		expect(secretMatches("pässwörd", "passwörd")).toBe(false);
	});
});

describe("gate", () => {
	const secret = "k".repeat(48);
	it("answers 404 when no secret is bound, whatever the request carries", () => {
		for (const env of [undefined, {}, { TIDY_PLATFORM_SECRET: "" }, { TIDY_PLATFORM_SECRET: 123 }]) {
			const g = gate(req(`Bearer ${secret}`), env as Record<string, unknown>);
			expect(g.ok).toBe(false);
			if (!g.ok) expect(g.response.status).toBe(404);
		}
	});
	it("answers 401 without or with a wrong bearer", () => {
		for (const r of [req(), req("Bearer nope"), req(`Bearer ${secret}x`), req(`Basic ${secret}`)]) {
			const g = gate(r, { TIDY_PLATFORM_SECRET: secret });
			expect(g.ok).toBe(false);
			if (!g.ok) {
				expect(g.response.status).toBe(401);
				expect(g.response.headers.get("www-authenticate")).toBe("Bearer");
			}
		}
	});
	it("passes with the right bearer", () => {
		expect(gate(req(`Bearer ${secret}`), { TIDY_PLATFORM_SECRET: secret }).ok).toBe(true);
	});
	it("skips the bearer check but keeps the 404 when asked (browser claim route)", () => {
		expect(gate(req(), { TIDY_PLATFORM_SECRET: secret }, false).ok).toBe(true);
		const g = gate(req(), {}, false);
		expect(g.ok).toBe(false);
		if (!g.ok) expect(g.response.status).toBe(404);
	});
});
