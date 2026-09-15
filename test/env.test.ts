import { describe, expect, it } from "vitest";
import { workerEnv } from "../src/lib/env";

describe("workerEnv", () => {
	it("returns the env exported by cloudflare:workers", async () => {
		expect(await workerEnv(async () => ({ env: { TIDY_PLATFORM_SECRET: "s" } }))).toEqual({ TIDY_PLATFORM_SECRET: "s" });
	});
	it("returns undefined when the module is missing or has no env (build time, tests)", async () => {
		expect(await workerEnv(async () => Promise.reject(new Error("No such module")))).toBeUndefined();
		expect(await workerEnv(async () => ({}))).toBeUndefined();
		expect(await workerEnv(async () => ({ env: "nope" }))).toBeUndefined();
	});
	it("never reads locals.runtime, whose getter throws on the Astro 6+ Cloudflare adapter", async () => {
		const locals = {} as Record<string, unknown>;
		Object.defineProperty(locals, "runtime", { get() { throw new Error("Astro.locals.runtime.env has been removed"); } });
		// The function takes no locals at all; this documents the constraint for the next maintainer.
		expect(workerEnv.length).toBeLessThanOrEqual(1);
		expect(() => (locals as { runtime?: unknown }).runtime).toThrow();
	});
});
