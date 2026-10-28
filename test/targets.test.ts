import { describe, expect, it } from "vitest";
import { getPath, imageTargets, labelFor, normText, setPath, textTargets } from "../src/editor/targets";
import type { Block, BlockTypeSchema } from "../src/editor/ops";

const columns: BlockTypeSchema = {
	slug: "columns", label: "Columns", currentVersion: 1,
	versions: [{ version: 1, fields: [
		{ slug: "across", label: "Across", type: "integer" },
		{ slug: "tone", label: "Background", type: "select", validation: { options: ["default", "dark"] } },
		{ slug: "background", label: "Background photo", type: "image" },
		{ slug: "css_class", label: "CSS class", type: "string" },
		{ slug: "slots", label: "Columns", type: "repeater", validation: { subFields: [
			{ slug: "kind", label: "Kind", type: "select", options: ["text", "card"] },
			{ slug: "heading", label: "Heading", type: "string" },
			{ slug: "text", label: "Text", type: "text" },
			{ slug: "image", label: "Image", type: "image" },
			{ slug: "link_url", label: "Link", type: "string" }
		] } }
	] }]
};
const block: Block = {
	_type: "columns", _key: "a", _version: 1, across: 3, tone: "dark", css_class: "sh-x",
	background: { meta: { storageKey: "bg.jpg" } },
	slots: [
		{ kind: "text", heading: "Three ways", text: "Some **markdown**", link_url: "/x" },
		{ kind: "card", heading: "", text: "   ", image: { src: "/media/card.png" } }
	]
};

describe("inline targets", () => {
	it("lists string and text fields with values, item by item, and marks a slot's text as markdown", () => {
		expect(textTargets(columns, block)).toEqual([
			{ path: "slots.0.heading", value: "Three ways", multiline: false, markdown: false },
			{ path: "slots.0.text", value: "Some **markdown**", multiline: true, markdown: true }
		]);
	});
	it("never offers addresses, names of other things, switches or classes for typing", () => {
		const paths = textTargets(columns, { ...block, tone: "dark", css_class: "x" }).map((t) => t.path);
		expect(paths).not.toContain("css_class");
		expect(paths).not.toContain("slots.0.link_url");
		expect(paths).not.toContain("slots.0.kind");
	});
	it("lists images by storage key or src", () => {
		expect(imageTargets(columns, block)).toEqual([{ path: "background", key: "bg.jpg" }, { path: "slots.1.image", key: "/media/card.png" }]);
	});
	it("reads and writes a path without mutating the block", () => {
		expect(getPath(block, "slots.0.heading")).toBe("Three ways");
		const next = setPath(block, "slots.0.heading", "Four ways");
		expect(getPath(next, "slots.0.heading")).toBe("Four ways");
		expect(getPath(block, "slots.0.heading")).toBe("Three ways");
		expect(next.slots).not.toBe(block.slots);
		expect(setPath(block, "css_class", "y").css_class).toBe("y");
	});
	it("labels a repeater entry with its number", () => {
		expect(labelFor(columns, block, "slots.1.heading")).toBe("Columns 2: Heading");
		expect(labelFor(columns, block, "css_class")).toBe("CSS class");
	});
	it("normalises whitespace for matching", () => {
		expect(normText("  Over 140\n Years ")).toBe("Over 140 Years");
	});
});
