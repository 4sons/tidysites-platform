import { describe, expect, it } from "vitest";
import { sanitizeHtml, scopeCss } from "../src/lib/sanitize";

describe("sanitizeHtml", () => {
	it("keeps ordinary markup and its classes", () => {
		expect(sanitizeHtml(`<header class="top"><a href="/contact" class="btn">Call</a><img src="/media/x.jpg" alt="x" width="40"></header>`)).toBe(`<header class="top"><a href="/contact" class="btn">Call</a><img src="/media/x.jpg" alt="x" width="40"></header>`);
	});
	it("drops script, styles in the markup, event handlers and javascript links", () => {
		const out = sanitizeHtml(`<div onclick="x()"><script>alert(1)</script><style>a{}</style><a href="javascript:alert(1)">no</a><a href="https://ok.test" onmouseover="x()">ok</a><img src="x" onerror="alert(1)"></div>`);
		expect(out).toBe(`<div><a>no</a><a href="https://ok.test">ok</a><img></div>`);
	});
	it("drops unknown tags but keeps their text, and encoded javascript", () => {
		expect(sanitizeHtml(`<marquee>hi</marquee><a href="&#106;avascript:alert(1)">x</a><iframe src="https://evil.test/"></iframe>`)).toBe(`hi<a>x</a><iframe></iframe>`);
	});
	it("lets frames show only known hosts and adds noopener to new-window links", () => {
		expect(sanitizeHtml(`<iframe src="https://www.youtube.com/embed/abc" allowfullscreen></iframe><a href="https://x.test" target="_blank">x</a>`)).toBe(`<iframe src="https://www.youtube.com/embed/abc" allowfullscreen=""></iframe><a href="https://x.test" rel="noopener" target="_blank">x</a>`);
	});
	it("keeps inline style unless it reaches out", () => {
		expect(sanitizeHtml(`<p style="color:red;background:url(https://ok.test/a.png)">a</p><p style="width:expression(alert(1))">b</p>`)).toBe(`<p style="color:red;background:url(https://ok.test/a.png)">a</p><p>b</p>`);
	});
	it("keeps the dialog opener so a row can open the booking dialog", () => {
		expect(sanitizeHtml(`<button type="button" data-tidy-dialog="ts-booking">Book</button>`)).toBe(`<button type="button" data-tidy-dialog="ts-booking">Book</button>`);
	});
});

describe("scopeCss", () => {
	it("prefixes every selector with the row's scope and keeps media queries", () => {
		expect(scopeCss(`.a{color:red}.b,.c{x:1}@media (max-width:600px){.a{color:blue}}`, `.ts-row[data-row="k"]`)).toBe(`.ts-row[data-row="k"] .a{color:red}.ts-row[data-row="k"] .b,.ts-row[data-row="k"] .c{x:1}@media (max-width:600px){.ts-row[data-row="k"] .a{color:blue}}`);
	});
	it("maps html and body to the row itself and strips imports and remote url()", () => {
		expect(scopeCss(`@import url(x.css);body{margin:0}.a{background:url(evil.js);b:url(https://ok.test/a.png)}`, `.r`)).toBe(`.r{margin:0}.r .a{background:url();b:url(https://ok.test/a.png)}`);
	});
	it("keeps keyframes and font-face unscoped", () => {
		expect(scopeCss(`@keyframes spin{to{transform:rotate(1turn)}}.a{animation:spin 1s}`, `.r`)).toBe(`@keyframes spin{to{transform:rotate(1turn)}}.r .a{animation:spin 1s}`);
	});
});
