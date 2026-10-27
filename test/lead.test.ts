import { describe, expect, it, vi } from "vitest";
import { forwardLead, handleLead, leadFrom, readLeadBody } from "../src/lib/lead";

const post = (body: Record<string, string>, headers: Record<string, string> = {}) => {
	const fd = new FormData();
	for (const [k, v] of Object.entries(body)) fd.append(k, v);
	return new Request("https://staging-acme.tidysites.dev/api/lead", { method: "POST", body: fd, headers: { referer: "https://staging-acme.tidysites.dev/registration", ...headers } });
};
const env = { TIDY_CONTROL_ORIGIN: "https://control.test", TIDY_SITE_ID: "site-1", TIDY_PLATFORM_SECRET: "s" };

describe("leadFrom", () => {
	it("keeps the contact columns, the form name, and every other answer under its label", () => {
		const lead = leadFrom({ name: " Ada ", email: "ada@x.test", phone: "", form: "Schedule a make up", q_class: "Tuesday 6pm", "label:q_class": "Which class?", q_notes: "", website_hp: "" }, "/registration", () => new Date("2026-10-26T12:00:00Z"));
		expect(lead).toEqual({ name: "Ada", email: "ada@x.test", phone: null, form: "Schedule a make up", fields: { "Which class?": "Tuesday 6pm" }, page: "/registration", submittedAt: "2026-10-26T12:00:00.000Z" });
	});
	it("labels an unlabelled field by its name", () => {
		expect(leadFrom({ name: "A", phone: "1", service: "Cleaning" }, null).fields).toEqual({ service: "Cleaning" });
	});
});

describe("readLeadBody", () => {
	it("joins repeated names, as a checkbox group posts them", async () => {
		const r = await readLeadBody(post({ name: "A" }));
		expect(r.name).toBe("A");
		const fd = new FormData(); fd.append("q_days", "Mon"); fd.append("q_days", "Wed");
		const j = await readLeadBody(new Request("https://x.test", { method: "POST", body: fd }));
		expect(j.q_days).toBe("Mon, Wed");
	});
	it("flattens a JSON body's fields object", async () => {
		const r = await readLeadBody(new Request("https://x.test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "A", fields: { Pet: "Dog" } }) }));
		expect(r).toEqual({ name: "A", Pet: "Dog" });
	});
});

describe("handleLead", () => {
	it("forwards the lead with every answer and answers JSON to a fetch", async () => {
		const calls: Array<{ url: string; body: unknown }> = [];
		const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return Response.json({ ok: true }); });
		const res = await handleLead(post({ name: "Ada", phone: "248", form: "Make up", q_when: "Tue", "label:q_when": "When?" }, { accept: "application/json" }), env, { fetch: f as unknown as typeof fetch });
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ ok: true, forwarded: true });
		expect(calls[0]!.url).toBe("https://control.test/sites/site-1/leads");
		expect(calls[0]!.body).toMatchObject({ name: "Ada", phone: "248", form: "Make up", fields: { "When?": "Tue" }, page: "https://staging-acme.tidysites.dev/registration" });
	});
	it("redirects a plain browser post to the thank-you page", async () => {
		const f = vi.fn(async () => Response.json({ ok: true }));
		const res = await handleLead(post({ name: "Ada", email: "a@x.test" }, { accept: "text/html,application/xhtml+xml" }), env, { fetch: f as unknown as typeof fetch });
		expect(res.status).toBe(303);
		expect(res.headers.get("location")).toBe("https://staging-acme.tidysites.dev/thank-you");
	});
	it("pretends success on a honeypot hit and never forwards", async () => {
		const f = vi.fn();
		const res = await handleLead(post({ name: "Bot", email: "b@x.test", website_hp: "x" }), env, { fetch: f as unknown as typeof fetch });
		expect(await res.json()).toEqual({ ok: true });
		expect(f).not.toHaveBeenCalled();
	});
	it("refuses without a way to reply, and a phone without a name", async () => {
		expect((await handleLead(post({ name: "Ada" }, { accept: "application/json" }), env)).status).toBe(400);
		expect((await handleLead(post({ phone: "248" }, { accept: "application/json" }), env)).status).toBe(400);
	});
	it("takes an email alone, as a newsletter signup", async () => {
		const f = vi.fn(async () => Response.json({ ok: true }));
		const res = await handleLead(post({ email: "a@x.test", form: "Newsletter" }, { accept: "application/json" }), env, { fetch: f as unknown as typeof fetch });
		expect(res.status).toBe(200);
	});
	it("requires a Turnstile token when a secret is bound", async () => {
		const res = await handleLead(post({ name: "Ada", email: "a@x.test" }, { accept: "application/json" }), { ...env, TURNSTILE_SECRET: "t" });
		expect(res.status).toBe(400);
		expect(((await res.json()) as { error: string }).error).toMatch(/verification/i);
	});
	it("reports when the site is not platform-hosted", async () => {
		expect(await forwardLead({}, leadFrom({ name: "A", email: "a@x.test" }, null))).toEqual({ forwarded: false, status: "not configured" });
	});
});
