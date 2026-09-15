import { describe, expect, it, vi } from "vitest";
import { PLATFORM_ROUTES, PLUGIN_ID, VERSION, tidyPlatform, tidyPlatformPlugin } from "../src/index";
import pkg from "../package.json";

describe("version", () => {
	it("matches package.json", () => {
		expect(VERSION).toBe(pkg.version);
	});
});

describe("tidyPlatform()", () => {
	it("injects every platform route as a server route with a package entrypoint", () => {
		const injectRoute = vi.fn();
		const integration = tidyPlatform();
		expect(integration.name).toBe("@tideworthy/tidysites-platform");
		(integration.hooks["astro:config:setup"] as unknown as (o: { injectRoute: typeof injectRoute }) => void)({ injectRoute });
		expect(injectRoute).toHaveBeenCalledTimes(PLATFORM_ROUTES.length);
		const patterns = injectRoute.mock.calls.map((c) => (c[0] as { pattern: string }).pattern).sort();
		expect(patterns).toEqual(["/_tidy/bootstrap", "/_tidy/health", "/_tidy/maintenance", "/_tidy/rotate-token", "/_tidy/session", "/_tidy/session/claim"]);
		for (const call of injectRoute.mock.calls) {
			const r = call[0] as { entrypoint: string; prerender: boolean };
			expect(r.prerender).toBe(false);
			expect(r.entrypoint.startsWith("@tideworthy/tidysites-platform/routes/")).toBe(true);
			expect(Object.keys(pkg.exports)).toContain(r.entrypoint.replace("@tideworthy/tidysites-platform", "."));
		}
	});
});

describe("tidyPlatformPlugin()", () => {
	it("is a native descriptor pointing at the plugin export", () => {
		expect(tidyPlatformPlugin()).toEqual({ id: PLUGIN_ID, version: VERSION, format: "native", entrypoint: "@tideworthy/tidysites-platform/plugin" });
		expect(Object.keys(pkg.exports)).toContain("./plugin");
	});
});
