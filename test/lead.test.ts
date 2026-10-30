import { describe, expect, it, vi } from "vitest";
import { signBotCheck } from "../src/lib/botcheck";
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
		expect(lead).toEqual({ name: "Ada", email: "ada@x.test", phone: null, form: "Schedule a make up", fields: { "Which class?": "Tuesday 6pm" }, files: [], page: "/registration", submittedAt: "2026-10-26T12:00:00.000Z" });
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
	it("skips Turnstile when the page's signed check names the trap field alone", async () => {
		const f = vi.fn(async () => Response.json({ ok: true }));
		const token = await signBotCheck("t", "Contact", "trap");
		const res = await handleLead(post({ name: "Ada", email: "a@x.test", form: "Contact", bot_check: token }, { accept: "application/json" }), { ...env, TURNSTILE_SECRET: "t" }, { fetch: f as unknown as typeof fetch });
		expect(res.status).toBe(200);
		const sent = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { fields: Record<string, string> };
		expect(sent.fields.bot_check).toBeUndefined();
	});
	it("still asks for Turnstile when the signed check names it, or was signed for another form, or is forged", async () => {
		const secret = { ...env, TURNSTILE_SECRET: "t" };
		for (const token of [await signBotCheck("t", "Contact", "turnstile"), await signBotCheck("t", "Quote", "trap"), await signBotCheck("other", "Contact", "trap"), "trap.00000000000000000000000000000000"]) {
			const res = await handleLead(post({ name: "Ada", email: "a@x.test", form: "Contact", bot_check: token }, { accept: "application/json" }), secret);
			expect(res.status).toBe(400);
		}
	});
	it("reports when the site is not platform-hosted", async () => {
		expect(await forwardLead({}, leadFrom({ name: "A", email: "a@x.test" }, null))).toEqual({ forwarded: false, status: "not configured" });
	});
});

describe("files on a lead", () => {
	it("keeps an attached document in the bucket under leads/ and names it on the lead; refuses other types and sizes", async () => {
		const { readLeadFiles, storeLeadFiles, leadFrom, leadLabels } = await import("../src/lib/lead");
		const put: Array<{ key: string; type?: string }> = [];
		const env = { MEDIA: { put: async (key: string, _v: unknown, o?: { httpMetadata?: { contentType?: string } }) => { put.push({ key, type: o?.httpMetadata?.contentType }); }, get: async () => null } } as never;
		const fd = new FormData();
		fd.set("name", "Pat"); fd.set("email", "pat@example.com"); fd.set("label:q_resume", "Resume");
		fd.set("q_resume", new File(["%PDF-1.4"], "My Resume.pdf", { type: "application/pdf" }));
		fd.set("q_bad", new File(["x"], "virus.exe", { type: "application/x-msdownload" }));
		const req = new Request("https://site.test/api/lead", { method: "POST", body: fd });
		const files = await readLeadFiles(req);
		expect(files.map((f) => f.field)).toEqual(["q_resume", "q_bad"]);
		const stored = await storeLeadFiles(env, files, { q_resume: "Resume" }, () => new Date("2026-10-27T20:00:00Z"));
		expect(stored.refused).toEqual(["virus.exe"]);
		expect(stored.files).toHaveLength(1);
		expect(stored.files[0]).toMatchObject({ label: "Resume", name: "My Resume.pdf", type: "application/pdf" });
		expect(stored.files[0]!.key).toMatch(/^leads\/20261027200000-[a-z0-9]+\/My-Resume\.pdf$/);
		expect(put[0]).toEqual({ key: stored.files[0]!.key, type: "application/pdf" });
		const body = { name: "Pat", email: "pat@example.com", "label:q_resume": "Resume" };
		const lead = leadFrom(body, null, () => new Date(), stored.files);
		expect(lead.fields.Resume).toBe("My Resume.pdf");
		expect(lead.files).toEqual(stored.files);
		expect(leadLabels(body)).toEqual({ q_resume: "Resume" });
		expect((await storeLeadFiles({} as never, files, {})).refused).toEqual(["My Resume.pdf", "virus.exe"]);
	});
});
