import { describe, expect, it } from "vitest";
import { coerce, compact, defaultsFor, fieldsOf, insertBlock, moveBlock, newKey, removeBlock, updateBlock, type Block, type BlockTypeSchema, type FieldSchema } from "../src/editor/ops";

const blocks: Block[] = [
	{ _type: "hero", _key: "a", _version: 1, headline: "One" },
	{ _type: "feature", _key: "b", _version: 2, text: "Two" },
	{ _type: "cta", _key: "c", _version: 1, headline: "Three" }
];

describe("block ops", () => {
	it("updates a block's fields without touching its type, key or version", () => {
		const out = updateBlock(blocks, "a", { headline: "New", _type: "hack", _key: "zzz", _version: 9 });
		expect(out[0]).toEqual({ _type: "hero", _key: "a", _version: 1, headline: "New" });
		expect(out[1]).toBe(blocks[1]);
	});
	it("moves within bounds and is a no-op at the edges", () => {
		expect(moveBlock(blocks, "c", -1).map((b) => b._key)).toEqual(["a", "c", "b"]);
		expect(moveBlock(blocks, "a", -1)).toBe(blocks);
		expect(moveBlock(blocks, "c", 1)).toBe(blocks);
		expect(moveBlock(blocks, "nope", 1)).toBe(blocks);
	});
	it("removes by key", () => {
		expect(removeBlock(blocks, "b").map((b) => b._key)).toEqual(["a", "c"]);
	});
	it("inserts after a key, or at the end, without a version so EmDash stamps the active one", () => {
		expect(insertBlock(blocks, "faq", "a", { group: "general" }, "k").map((b) => b._key)).toEqual(["a", "k", "b", "c"]);
		const end = insertBlock(blocks, "faq", null, {}, "k");
		expect(end[3]).toEqual({ _type: "faq", _key: "k" });
		expect("_version" in (end[3] as Block)).toBe(false);
	});
	it("keys are 12 lowercase alphanumerics", () => {
		expect(newKey()).toMatch(/^[a-z0-9]{12}$/);
		expect(newKey(() => 0)).toBe("aaaaaaaaaaaa");
	});
});

describe("schema helpers", () => {
	const reviews: BlockTypeSchema = {
		slug: "reviews",
		label: "Reviews",
		currentVersion: 2,
		versions: [
			{ version: 1, fields: [{ slug: "headline", label: "Headline", type: "string" }] },
			{
				version: 2,
				fields: [
					{ slug: "headline", label: "Headline", type: "string" },
					{ slug: "limit", label: "How many", type: "integer" },
					{ slug: "featured_only", label: "Featured only", type: "boolean" },
					{ slug: "side", label: "Side", type: "select", validation: { options: ["left", "right"] } },
					{ slug: "tone", label: "Tone", type: "select", defaultValue: "warm", validation: { options: ["warm", "plain"] } },
					{ slug: "image", label: "Image", type: "image" },
					{ slug: "items", label: "Items", type: "repeater", validation: { subFields: [{ slug: "title", label: "Title", type: "string" }] } }
				]
			}
		]
	};
	it("reads the fields of the active version by default and of a retained version on request", () => {
		expect(fieldsOf(reviews).map((f) => f.slug)).toEqual(["headline", "limit", "featured_only", "side", "tone", "image", "items"]);
		expect(fieldsOf(reviews, 1).map((f) => f.slug)).toEqual(["headline"]);
		expect(fieldsOf(reviews, 7).map((f) => f.slug)).toEqual(fieldsOf(reviews).map((f) => f.slug));
	});
	it("builds defaults per field type, leaving typed fields without a value absent", () => {
		expect(defaultsFor(reviews)).toEqual({ headline: "", featured_only: false, side: "left", tone: "warm", items: [] });
	});
	it("coerces raw form values and reports no value as undefined", () => {
		const f = (type: string, extra: Partial<FieldSchema> = {}): FieldSchema => ({ slug: "x", label: "X", type, ...extra });
		expect(coerce(f("integer"), "12.7")).toBe(12);
		expect(coerce(f("number"), "12.7")).toBe(12.7);
		expect(coerce(f("number"), "")).toBeUndefined();
		expect(coerce(f("number"), "abc")).toBeUndefined();
		expect(coerce(f("boolean"), "on")).toBe(true);
		expect(coerce(f("boolean"), undefined)).toBe(false);
		expect(coerce(f("string"), 5)).toBe("5");
		expect(coerce(f("select"), "")).toBeUndefined();
		expect(coerce(f("select"), "left")).toBe("left");
		expect(coerce(f("multiSelect"), ["a", 3, "b"])).toEqual(["a", "b"]);
		expect(coerce(f("repeater"), "x")).toEqual([]);
		expect(coerce(f("image"), { id: "m1" })).toEqual({ id: "m1" });
		expect(coerce(f("image"), "")).toBeUndefined();
	});
	it("compact drops undefined values and keeps everything else", () => {
		expect(compact({ a: 1, b: undefined, c: null, d: "", e: false })).toEqual({ a: 1, c: null, d: "", e: false });
	});
});
