import { describe, expect, it, vi } from "vitest";
import { TidySiteError, createTidySiteClient } from "../src/client";

describe("createTidySiteClient", () => {
	it("sends the bearer secret, JSON bodies, and parses responses", async () => {
		const seen: Request[] = [];
		const fetchImpl = vi.fn(async (r: Request) => {
			seen.push(r);
			return new Response(JSON.stringify({ ok: true, echo: r.url }), { status: 200 });
		});
		const c = createTidySiteClient({ origin: "https://staging-acme.tidysites.dev/", secret: "sec", fetch: fetchImpl });
		await c.bootstrap({ adminEmail: "p@a.test" });
		await c.health();
		await c.maintenance("* * * * *");
		await c.rotateToken();
		expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
			"POST https://staging-acme.tidysites.dev/_tidy/bootstrap",
			"GET https://staging-acme.tidysites.dev/_tidy/health",
			"POST https://staging-acme.tidysites.dev/_tidy/maintenance?cron=*%20*%20*%20*%20*",
			"POST https://staging-acme.tidysites.dev/_tidy/rotate-token"
		]);
		for (const r of seen) expect(r.headers.get("authorization")).toBe("Bearer sec");
		expect(await seen[0]!.clone().json()).toEqual({ adminEmail: "p@a.test" });
		expect(seen[1]!.headers.get("content-type")).toBeNull();
	});

	it("throws TidySiteError with status and body on non-2xx", async () => {
		const c = createTidySiteClient({ origin: "https://x.test", secret: "s", fetch: async () => new Response(JSON.stringify({ ok: false, error: "nope" }), { status: 401 }) });
		await expect(c.health()).rejects.toMatchObject({ status: 401, body: { ok: false, error: "nope" } });
		await expect(c.health()).rejects.toBeInstanceOf(TidySiteError);
	});
});
