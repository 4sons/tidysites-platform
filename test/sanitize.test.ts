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
	it("escapes an attribute value once, however it arrived", () => {
		expect(sanitizeHtml(`<a href="/x" aria-label="Design &amp; Build" title="Say &quot;hi&quot;">x</a>`)).toBe(`<a href="/x" aria-label="Design &amp; Build" title="Say &quot;hi&quot;">x</a>`);
		expect(sanitizeHtml(`<img alt="Tom & Jerry">`)).toBe(`<img alt="Tom &amp; Jerry">`);
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

describe("sanitizeHtml and inline SVG", () => {
	it("keeps masks, clip paths, gradients and paint attributes that name the markup's own ids", () => {
		const svg = `<svg viewBox="0 0 10 10" fill="none"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.5"></stop></linearGradient><mask id="m"><rect width="10" height="10" fill="#fff"></rect></mask><clipPath id="c"><circle cx="5" cy="5" r="5"></circle></clipPath></defs><g mask="url(#m)" clip-path="url(#c)"><path d="M0 0h10" fill="url(#g)" fill-opacity="0" stroke-opacity="0.5" transform="rotate(10)"></path><image href="data:image/png;base64,AAAA" width="10" height="10"></image></g></svg>`;
		const out = sanitizeHtml(svg);
		expect(out).toContain(`<mask id="m">`);
		expect(out).toContain(`<clipPath id="c">`.toLowerCase());
		expect(out).toContain(`mask="url(#m)"`);
		expect(out).toContain(`clip-path="url(#c)"`);
		expect(out).toContain(`fill="url(#g)"`);
		expect(out).toContain(`fill-opacity="0"`);
		expect(out).toContain(`stop-opacity="0.5"`);
		expect(out).toContain(`<image href="data:image/png;base64,AAAA"`);
	});
	it("drops a paint reference that reaches out and an image from an unknown scheme", () => {
		const out = sanitizeHtml(`<svg><path d="M0 0" fill="url(https://evil.test/a.svg#x)" mask="url(//evil.test/m)"></path><image href="javascript:alert(1)"></image></svg>`);
		expect(out).toBe(`<svg><path d="M0 0"></path><image></image></svg>`);
	});
});

describe("urls in row CSS", () => {
	it("keeps inline pictures, quoted or bare, with parentheses inside, and the site's own and web addresses", () => {
		const css = `.a{background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0h10' fill='rgb(0,0,0)'/></svg>")}.b{background:url(data:image/png;base64,AAAA)}.c{background-image:url('/x.png')}.d{background:url(https://x.test/a.png)}`;
		expect(scopeCss(css, ".r")).toBe(`.r .a{background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0h10' fill='rgb(0,0,0)'/></svg>")}.r .b{background:url(data:image/png;base64,AAAA)}.r .c{background-image:url('/x.png')}.r .d{background:url(https://x.test/a.png)}`);
	});
	it("empties a relative or unknown-scheme url", () => {
		expect(scopeCss(`.d{background:url(../x.png)}.e{mask:url('file:///etc/passwd')}`, ".r")).toBe(`.r .d{background:url()}.r .e{mask:url()}`);
		expect(sanitizeHtml(`<p style="background:url(&quot;data:image/png;base64,AA&quot;)">a</p><p style="background:url(../x.png)">b</p>`)).toBe(`<p style="background:url(&quot;data:image/png;base64,AA&quot;)">a</p><p>b</p>`);
	});
});
