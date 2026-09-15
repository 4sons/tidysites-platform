import { describe, expect, it, vi } from "vitest";
import { requestPublish } from "../src/lib/publish";

const bindings = (fetchImpl: (input: string, init?: RequestInit) => Promise<Response>) => ({
	TIDY_CONTROL_ORIGIN: "https://control.test/",
	TIDY_SITE_ID: "acme",
	TIDY_PLATFORM_SECRET: "s".repeat(40),
	PLATFORM: { fetch: fetchImpl }
});

describe("requestPublish", () => {
	it("is a no-op without the platform bindings (an exported site)", async () => {
		const fetchImpl = vi.fn();
		for (const env of [undefined, {}, { ...bindings(fetchImpl), PLATFORM: undefined }, { ...bindings(fetchImpl), TIDY_SITE_ID: undefined }, { ...bindings(fetchImpl), TIDY_PLATFORM_SECRET: 5 }]) {
			expect(await requestPublish(env as never, { reason: "publish" })).toEqual({ sent: false, why: "no-bindings" });
		}
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("posts to /sites/:id/publish over the PLATFORM binding with the site secret and the event", async () => {
		const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
		const out = await requestPublish(bindings(fetchImpl), { reason: "unpublish", collection: "pages", id: "01H" });
		expect(out).toEqual({ sent: true, status: 202 });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://control.test/sites/acme/publish");
		expect(init.method).toBe("POST");
		expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${"s".repeat(40)}`);
		expect(JSON.parse(String(init.body))).toEqual({ reason: "unpublish", collection: "pages", id: "01H" });
	});

	it("url-encodes the site id", async () => {
		const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
		await requestPublish({ ...bindings(fetchImpl), TIDY_SITE_ID: "a/b c" }, { reason: "publish" });
		expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe("https://control.test/sites/a%2Fb%20c/publish");
	});

	it("reports but never throws on a failing response or a thrown fetch", async () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(await requestPublish(bindings(async () => new Response("no", { status: 500 })), { reason: "publish" })).toEqual({ sent: true, status: 500 });
		expect(await requestPublish(bindings(async () => Promise.reject(new Error("boom"))), { reason: "delete" })).toEqual({ sent: false, why: "error", error: "Error: boom" });
		expect(err).toHaveBeenCalledTimes(2);
		err.mockRestore();
	});
});
