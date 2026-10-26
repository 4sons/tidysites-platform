import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { validateSeed } from "emdash";
import { SECTION_TYPES, collections, mergeStructure, sectionTypes, template } from "../src/template/index";

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
			for (const t of SECTION_TYPES) expect(allowed, `${c.slug}.sections allows ${t}`).toContain(t);
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
