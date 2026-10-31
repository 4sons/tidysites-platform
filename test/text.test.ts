import { describe, expect, it } from "vitest";
import { paragraphs, paragraphsHtml } from "../src/lib/text";

describe("paragraphs", () => {
	it("splits on blank lines and keeps single newlines as line breaks", () => {
		expect(paragraphs("One line.\n\nTwo\nlines.\n\n\nThree.")).toEqual([["One line."], ["Two", "lines."], ["Three."]]);
		expect(paragraphs("Windows\r\n\r\nends")).toEqual([["Windows"], ["ends"]]);
		expect(paragraphs("   \n\n")).toEqual([]);
	});
	it("prints escaped paragraphs with <br> between lines", () => {
		expect(paragraphsHtml("A & B\nC\n\n<D>")).toBe(`<p>A &amp; B<br>C</p><p>&lt;D&gt;</p>`);
	});
});
