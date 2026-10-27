import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PACKAGE_STRINGS } from "../src/lib/strings";
import { parseWording } from "../src/sections/lib";
import { collections } from "../src/template/index";

function astroFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? astroFiles(join(dir, e.name)) : e.name.endsWith(".astro") ? [join(dir, e.name)] : []));
}

describe("wording", () => {
	it("reads Original => Replacement lines and skips the rest", () => {
		expect(parseWording("Call or text => Call us\nHours=>Opening hours\nno arrow here\n => empty\nX => ")).toEqual({ "Call or text": "Call us", Hours: "Opening hours" });
		expect(parseWording(undefined)).toEqual({});
	});
	it("lists every label the package passes through tx(), and nothing else", () => {
		const used = new Set<string>();
		for (const f of astroFiles("src")) for (const m of readFileSync(f, "utf8").matchAll(/\btx\("([^"]+)"\)/g)) used.add(m[1]!);
		expect([...used].sort()).toEqual([...PACKAGE_STRINGS].sort());
	});
	it("keeps the wording field on the frame record", () => {
		expect(collections.find((c) => c.slug === "frame")!.fields.some((f) => f.slug === "wording")).toBe(true);
	});
});
