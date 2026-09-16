import { describe, expect, it } from "vitest";
import { coerce, defaultsFor, insertBlock, moveBlock, newKey, removeBlock, updateBlock, type Block, type BlockSchema, type FieldSchema } from "../src/editor/ops";

const blocks: Block[] = [
	{ _type: "pest.hero", _key: "a", headline: "One" },
	{ _type: "block", _key: "b", children: [] },
	{ _type: "pest.cta", _key: "c", headline: "Three" }
];

describe("block ops", () => {
	it("updates a block's fields without touching its type or key", () => {
		const out = updateBlock(blocks, "a", { headline: "New", _type: "hack", _key: "zzz" });
		expect(out[0]).toEqual({ _type: "pest.hero", _key: "a", headline: "New" });
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
	it("inserts after a key, or at the end", () => {
		expect(insertBlock(blocks, "pest.faq", "a", { group: "general" }, "k").map((b) => b._key)).toEqual(["a", "k", "b", "c"]);
		const end = insertBlock(blocks, "pest.faq", null, {}, "k");
		expect(end[3]).toEqual({ _type: "pest.faq", _key: "k" });
	});
	it("keys are 12 lowercase alphanumerics", () => {
		expect(newKey()).toMatch(/^[a-z0-9]{12}$/);
		expect(newKey(() => 0)).toBe("aaaaaaaaaaaa");
	});
});

describe("schema helpers", () => {
	const schema: BlockSchema = {
		type: "pest.reviews",
		label: "Reviews",
		fields: [
			{ type: "text_input", action_id: "headline", label: "Headline" },
			{ type: "number_input", action_id: "limit", label: "How many" },
			{ type: "toggle", action_id: "featuredOnly", label: "Featured only" },
			{ type: "select", action_id: "side", label: "Side", options: [{ label: "L", value: "left" }, { label: "R", value: "right" }] },
			{ type: "repeater", action_id: "items", label: "Items", fields: [] }
		]
	};
	it("builds empty defaults per field type", () => {
		expect(defaultsFor(schema)).toEqual({ headline: "", limit: null, featuredOnly: false, side: "left", items: [] });
	});
	it("coerces raw form values", () => {
		const [text, num, tog, , rep] = schema.fields as [FieldSchema, FieldSchema, FieldSchema, FieldSchema, FieldSchema];
		expect(coerce(num, "12")).toBe(12);
		expect(coerce(num, "")).toBeNull();
		expect(coerce(num, "abc")).toBeNull();
		expect(coerce(tog, "on")).toBe(true);
		expect(coerce(tog, undefined)).toBe(false);
		expect(coerce(text, 5)).toBe("5");
		expect(coerce(rep, "x")).toEqual([]);
	});
});
