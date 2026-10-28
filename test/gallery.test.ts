import { describe, expect, it } from "vitest";
import { gallery } from "../src/lib/gallery";
import { sectionTypes } from "../src/template/index";

describe("gallery", () => {
	const groups = gallery(sectionTypes);
	it("shows every section type but the one that depends on its page, one sample per layout", () => {
		expect(groups.map((g) => g.slug)).toEqual(sectionTypes.map((t) => t.slug).filter((s) => s !== "related"));
		const hero = groups.find((g) => g.slug === "hero")!;
		expect(hero.samples.map((s) => s.block.variant)).toEqual(["headline and photo", "headline and booking card", "headline and form", "photo with headline over", "headline and picker"]);
		for (const g of groups) for (const s of g.samples) expect(s.block._type).toBe(g.slug);
	});
	it("fills repeaters, names the variant in the headline, and gives the markup sections something to render", () => {
		const cards = groups.find((g) => g.slug === "feature")!.samples[0]!.block;
		expect((cards.points as unknown[]).length).toBe(3);
		expect(cards.headline).toBe("Cards: cards");
		expect(String(groups.find((g) => g.slug === "row")!.samples[0]!.block.html)).toContain("renders here");
		const cols = groups.find((g) => g.slug === "columns")!.samples[0]!.block;
		expect((cols.slots as Array<{ kind: string }>).map((s) => s.kind)).toEqual(["text", "card", "number", "text"]);
	});
	it("keys every sample so the editor frames are distinct", () => {
		const keys = groups.flatMap((g) => g.samples.map((s) => String(s.block._key)));
		expect(new Set(keys).size).toBe(keys.length);
	});
});
