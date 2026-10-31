import { describe, expect, it } from "vitest";
import { markdownToHtml } from "../src/lib/markdown";

describe("markdownToHtml", () => {
	it("renders headings, paragraphs, lists, links, bold and italic", () => {
		const md = "## What you get\n\nRoofers on **our** payroll, on *your* building.\n\n- Certified [TREMCO](/about) contractor\n- 24/7 leak response\n\n1. Call\n2. Walk the roof";
		expect(markdownToHtml(md)).toBe(
			`<h2>What you get</h2>\n<p>Roofers on <strong>our</strong> payroll, on <em>your</em> building.</p>\n<ul><li>Certified <a href="/about">TREMCO</a> contractor</li><li>24/7 leak response</li></ul>\n<ol><li>Call</li><li>Walk the roof</li></ol>`
		);
	});
	it("turns a single newline inside a paragraph into a line break", () => {
		expect(markdownToHtml("Brookfield Street\nLivonia, MI")).toBe("<p>Brookfield Street<br>Livonia, MI</p>");
	});
	it("escapes raw HTML and refuses javascript links", () => {
		expect(markdownToHtml(`<script>x()</script> and [go](javascript:alert(1))`)).toBe("<p>&lt;script&gt;x()&lt;/script&gt; and go</p>");
	});
	it("renders images, quotes and rules", () => {
		expect(markdownToHtml("![Crew](/media/crew.jpg)\n\n> Quoted line\n\n---")).toBe(`<p><img src="/media/crew.jpg" alt="Crew" loading="lazy"></p>\n<blockquote><p>Quoted line</p></blockquote>\n<hr>`);
	});
	it("gives nothing for empty text", () => {
		expect(markdownToHtml("")).toBe("");
		expect(markdownToHtml("  \n ")).toBe("");
	});
});

describe("inlineMarkdown", () => {
	it("prints links, bold and italics in one line, escaped", async () => {
		const { inlineMarkdown } = await import("../src/lib/markdown");
		expect(inlineMarkdown("By sending you agree to our [Privacy Policy](/privacy) & **Terms**.")).toBe(`By sending you agree to our <a href="/privacy">Privacy Policy</a> &amp; <strong>Terms</strong>.`);
		expect(inlineMarkdown("See [this](https://x.test/a) <b>")).toBe(`See <a href="https://x.test/a" target="_blank" rel="noopener">this</a> &lt;b&gt;`);
	});
});
