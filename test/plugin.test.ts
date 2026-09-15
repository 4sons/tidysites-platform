import { beforeEach, describe, expect, it, vi } from "vitest";

const hookEnv = vi.fn<() => Promise<Record<string, unknown> | undefined>>();
vi.mock("../src/lib/env", () => ({ hookEnv: () => hookEnv() }));

import { HOOK_TIMEOUT_MS, createPlugin } from "../src/plugin";
import { PLUGIN_ID, VERSION } from "../src/version";

type HookConfig = { errorPolicy: string; timeout: number; handler: (event: unknown, ctx?: unknown) => Promise<void> };

describe("createPlugin()", () => {
	beforeEach(() => hookEnv.mockReset());

	it("declares id, version, content:read, and the three content hooks with continue-on-error", () => {
		const p = createPlugin() as unknown as { id: string; version: string; capabilities: string[]; hooks: Record<string, HookConfig> };
		expect(p.id).toBe(PLUGIN_ID);
		expect(p.version).toBe(VERSION);
		expect(p.capabilities).toEqual(["content:read"]);
		expect(Object.keys(p.hooks).sort()).toEqual(["content:afterDelete", "content:afterPublish", "content:afterUnpublish"]);
		for (const h of Object.values(p.hooks)) {
			expect(h.errorPolicy).toBe("continue");
			expect(h.timeout).toBe(HOOK_TIMEOUT_MS);
		}
	});

	it("does nothing when the worker env is unavailable (build time, exported site)", async () => {
		hookEnv.mockResolvedValue(undefined);
		const p = createPlugin() as unknown as { hooks: Record<string, HookConfig> };
		await expect(p.hooks["content:afterPublish"]!.handler({ content: { id: "x" }, collection: "pages" })).resolves.toBeUndefined();
	});

	it("forwards publish, unpublish and delete events with collection and id", async () => {
		const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
		hookEnv.mockResolvedValue({ TIDY_CONTROL_ORIGIN: "https://control.test", TIDY_SITE_ID: "acme", TIDY_PLATFORM_SECRET: "k".repeat(32), PLATFORM: { fetch: fetchImpl } });
		const p = createPlugin() as unknown as { hooks: Record<string, HookConfig> };
		await p.hooks["content:afterPublish"]!.handler({ content: { id: "01A", title: "Hi" }, collection: "pages" });
		await p.hooks["content:afterUnpublish"]!.handler({ content: { id: "01B" }, collection: "posts" });
		await p.hooks["content:afterDelete"]!.handler({ id: "01C", collection: "services" });
		const bodies = fetchImpl.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)));
		expect(bodies).toEqual([
			{ reason: "publish", collection: "pages", id: "01A" },
			{ reason: "unpublish", collection: "posts", id: "01B" },
			{ reason: "delete", collection: "services", id: "01C" }
		]);
	});

	it("swallows control-plane failures so the editor's publish succeeds", async () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		hookEnv.mockResolvedValue({ TIDY_CONTROL_ORIGIN: "https://control.test", TIDY_SITE_ID: "acme", TIDY_PLATFORM_SECRET: "k".repeat(32), PLATFORM: { fetch: async () => Promise.reject(new Error("down")) } });
		const p = createPlugin() as unknown as { hooks: Record<string, HookConfig> };
		await expect(p.hooks["content:afterPublish"]!.handler({ content: { id: "x" }, collection: "pages" })).resolves.toBeUndefined();
		err.mockRestore();
	});
});
