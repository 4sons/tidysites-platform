import { describe, expect, it } from "vitest";
import { validateSeed } from "emdash";
import structure from "../template/structure.json";

describe("the template's structure as a seed", () => {
	it("validates under the store version the themes run, so a reserved field name never reaches a site", () => {
		const v = validateSeed(structure as never);
		expect(v.errors ?? []).toEqual([]);
		expect(v.valid).toBe(true);
	});
});
