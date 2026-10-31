import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { validateSeed } from "emdash";
import { SECTION_TYPES, collections, mergeStructure, sectionTypes, template } from "../src/template/index";
import { render } from "../src/lib/template";

describe("the template", () => {
	it("is a valid seed structure", () => {
		const r = validateSeed(template as unknown as Record<string, unknown>);
		expect(r.valid, JSON.stringify(r.errors)).toBe(true);
	});
	it("has a default component for every section type", () => {
		const files = readdirSync(new URL("../src/sections/defaults/", import.meta.url)).filter((f) => f.endsWith(".astro") && !f.startsWith("_")).map((f) => f.replace(/\.astro$/, ""));
		for (const t of SECTION_TYPES) expect(files, `default for ${t}`).toContain(t);
		for (const f of files) expect(SECTION_TYPES, `${f}.astro has a section type`).toContain(f);
	});
	it("lets every page-like collection hold every section type", () => {
		for (const c of collections) {
			const f = c.fields.find((x) => x.type === "blocks");
			if (!f) continue;
			const allowed = (f.validation as { allowedTypes: string[] }).allowedTypes;
			// A saved section holds any section but another saved section.
			for (const t of SECTION_TYPES) if (!(c.slug === "saved_sections" && t === "saved")) expect(allowed, `${c.slug}.${f.slug} allows ${t}`).toContain(t);
		}
	});
	it("keeps a saved section from holding another saved section", () => {
		const f = collections.find((c) => c.slug === "saved_sections")!.fields.find((x) => x.type === "blocks")!;
		const v = f.validation as { allowedTypes: string[]; maxItems: number };
		expect(v.allowedTypes).not.toContain("saved");
		expect(v.maxItems).toBe(1);
		for (const c of collections) {
			const b = c.fields.find((x) => x.type === "blocks");
			if (b && c.slug !== "saved_sections") expect((b.validation as { allowedTypes: string[] }).allowedTypes).toContain("saved");
		}
	});
	it("keeps every collection under D1's column cap (100 columns a table, one per field plus EmDash's own)", () => {
		for (const c of collections) expect(c.fields.length, `${c.slug} has ${c.fields.length} fields; a new group of fields gets its own one-record collection`).toBeLessThanOrEqual(75);
	});
	it("requires only names", () => {
		for (const c of collections) {
			const required = c.fields.filter((f) => f.required).map((f) => f.slug);
			expect(required.length, `${c.slug} required ${required.join(",")}`).toBeLessThanOrEqual(2);
			expect(required).toContain("title");
		}
	});
	it("merges its structure over a theme seed and keeps the theme's content", () => {
		const seed = { version: "1", meta: { name: "Theme" }, settings: { title: "X" }, blockTypes: [{ slug: "mine" }], collections: [{ slug: "mine" }], menus: [{ name: "primary", label: "Main", items: [] }], content: { services: [{ id: "a", slug: "a", data: { title: "A" } }] } };
		const out = mergeStructure(seed);
		expect(out.collections).toBe(collections);
		expect(out.blockTypes).toBe(sectionTypes);
		expect(out.settings).toEqual({ title: "X" });
		expect(out.menus).toEqual(seed.menus);
		expect(out.content).toEqual(seed.content);
		expect(validateSeed(out as unknown as Record<string, unknown>).valid).toBe(true);
	});
});

import { formDialog } from "../src/sections/lib";
describe("formDialog", () => {
	it("recognises a form link and names its dialog; ordinary links are left alone", () => {
		expect(formDialog("#form:Class registration")).toEqual({ name: "Class registration", id: "ts-form-class-registration" });
		expect(formDialog("form:Membership")).toEqual({ name: "Membership", id: "ts-form-membership" });
		expect(formDialog("/contact")).toBeNull();
		expect(formDialog("#form:")).toBeNull();
		expect(formDialog(undefined)).toBeNull();
	});
});

describe("conditions that compare two paths", () => {
	it("matches an item against the outer loop's item", () => {
		const out = render(`{{#each cats as c}}<h2>{{ c.title }}</h2>{{#each services as s}}{{#if s.category_title == c.title}}<a>{{ s.title }}</a>{{/if}}{{/each}}{{/each}}`, { cats: [{ title: "Heat" }, { title: "Cool" }], services: [{ title: "Furnace", category_title: "Heat" }, { title: "AC", category_title: "Cool" }] });
		expect(out).toBe("<h2>Heat</h2><a>Furnace</a><h2>Cool</h2><a>AC</a>");
		expect(render(`{{#if a != b}}differ{{else}}same{{/if}}`, { a: "1", b: "1" })).toBe("same");
	});
	it("still refuses a condition it cannot read", () => {
		expect(() => render(`{{#if a == }}x{{/if}}`, {})).toThrow(/Cannot read/);
	});
});

describe("literals on the right of a condition", () => {
	it("compares a bare number as a value, not a path", () => {
		expect(render(`{{#each faqs as f}}<details{{#if f.sort == 1}} open{{/if}}>{{ f.title }}</details>{{/each}}`, { faqs: [{ sort: 1, title: "A" }, { sort: 2, title: "B" }] })).toBe(`<details open>A</details><details>B</details>`);
		expect(render(`{{#if n != 2}}not two{{/if}}`, { n: 1 })).toBe(`not two`);
		expect(render(`{{#if on == true}}yes{{/if}}{{#if off == false}}no{{/if}}`, { on: true, off: false })).toBe(`yesno`);
	});
	it("still reads a bare name as a path", () => {
		expect(render(`{{#if a == b}}same{{/if}}`, { a: "x", b: "x" })).toBe(`same`);
	});
});
