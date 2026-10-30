import { describe, expect, it } from "vitest";
import { portableTextToHtml, isPortableText } from "../src/lib/portable-text";

describe("rich text as HTML", () => {
	it("prints paragraphs, headings, lists, marks and links", () => {
		const blocks = [
			{ _type: "block", style: "h2", children: [{ _type: "span", text: "Why" }] },
			{ _type: "block", style: "normal", markDefs: [{ _key: "l1", _type: "link", href: "/contact" }], children: [{ _type: "span", text: "Call ", marks: [] }, { _type: "span", text: "us", marks: ["strong", "l1"] }, { _type: "span", text: " <now>", marks: [] }] },
			{ _type: "block", listItem: "bullet", level: 1, children: [{ _type: "span", text: "one" }] },
			{ _type: "block", listItem: "bullet", level: 1, children: [{ _type: "span", text: "two" }] },
			{ _type: "block", listItem: "number", level: 1, children: [{ _type: "span", text: "first" }] },
			{ _type: "image", asset: "x" },
			{ _type: "block", style: "normal", children: [{ _type: "span", text: "" }] }
		];
		expect(isPortableText(blocks)).toBe(true);
		expect(portableTextToHtml(blocks)).toBe(`<h2>Why</h2><p>Call <a href="/contact"><strong>us</strong></a> &lt;now&gt;</p><ul><li>one</li><li>two</li></ul><ol><li>first</li></ol>`);
	});
	it("leaves anything that is not rich text alone", () => {
		expect(isPortableText("text")).toBe(false);
		expect(isPortableText([])).toBe(false);
		expect(portableTextToHtml([{ no: "type" }])).toBe("");
	});
});
