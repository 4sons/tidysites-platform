import { describe, expect, it } from "vitest";
import { parse, referenced, render, splitIncludes, TemplateError } from "../src/lib/template";

const ctx = {
	business: { title: "Kellermeier", phone: "(616) 866-5134", phone_href: "tel:+16168665134", logo: { url: "/logo.webp", alt: "Kellermeier" }, social: [{ network: "facebook", url: "https://fb.test/k" }] },
	page: { title: "Water Heaters", summary: "", collection: "services", image: { url: "/wh.jpg", alt: "A heater" } },
	services: [
		{ title: "Water Heaters", url: "/services/water-heaters", category_title: "Plumbing" },
		{ title: "Boilers", url: "/services/boilers", category_title: "Heating" }
	],
	reviews: []
};

describe("render", () => {
	it("fills values and escapes them", () => {
		expect(render(`<a href="{{ business.phone_href }}">{{business.phone}}</a> <b>{{ page.title }}</b>`, ctx)).toBe(`<a href="tel:+16168665134">(616) 866-5134</a> <b>Water Heaters</b>`);
		expect(render(`{{ x }}`, { x: `<script>alert("1")</script>` })).toBe(`&lt;script&gt;alert(&quot;1&quot;)&lt;/script&gt;`);
		expect(render(`{{{ x }}}`, { x: `<em>hi</em>` })).toBe(`<em>hi</em>`);
	});

	it("prints nothing for a missing path, an image as its address, a list as its count", () => {
		expect(render(`[{{ page.nope }}][{{ nothing.at.all }}]`, ctx)).toBe(`[][]`);
		expect(render(`{{ page.image }} {{ services }}`, ctx)).toBe(`/wh.jpg 2`);
	});

	it("loops with this, an alias, the item's own fields and the counters", () => {
		const t = `<ul>{{#each services as s}}<li class="{{#if @first}}first{{/if}}">{{@number}}. <a href="{{ s.url }}">{{ title }}</a> ({{ this.category_title }})</li>{{/each}}</ul>`;
		expect(render(t, ctx)).toBe(`<ul><li class="first">1. <a href="/services/water-heaters">Water Heaters</a> (Plumbing)</li><li class="">2. <a href="/services/boilers">Boilers</a> (Heating)</li></ul>`);
		expect(render(`{{#each reviews}}x{{else}}No reviews yet{{/each}}`, ctx)).toBe(`No reviews yet`);
		expect(render(`{{#each services limit=1}}{{title}}{{/each}}`, ctx)).toBe(`Water Heaters`);
	});

	it("reaches outer names from inside a loop", () => {
		expect(render(`{{#each services}}{{ business.title }}: {{ title }};{{/each}}`, ctx)).toBe(`Kellermeier: Water Heaters;Kellermeier: Boilers;`);
	});

	it("tests values, compares to a literal, and negates", () => {
		expect(render(`{{#if page.summary}}has{{else}}none{{/if}}`, ctx)).toBe(`none`);
		expect(render(`{{#if page.collection == "services"}}svc{{/if}}{{#if page.collection != "services"}}other{{/if}}`, ctx)).toBe(`svc`);
		expect(render(`{{#unless page.summary}}bare{{/unless}}`, ctx)).toBe(`bare`);
		expect(render(`{{#if business.social}}social{{/if}}{{#if reviews}}reviews{{/if}}`, ctx)).toBe(`social`);
	});

	it("turns a drop-in into a token that survives as text and splits back out", () => {
		const out = render(`<nav>{{> menu "primary" depth=1}}</nav>{{> logo}}`, ctx);
		const parts = splitIncludes(out);
		expect(parts).toEqual([{ html: "<nav>" }, { include: { name: "menu", args: ["primary"], named: { depth: "1" } } }, { html: "</nav>" }, { include: { name: "logo", args: [], named: {} } }]);
	});

	it("names what a text reads so only that is loaded", () => {
		const r = referenced(`{{ business.phone }} {{#each services as s}}{{ s.title }} {{ page.title }}{{/each}} {{> hours}} {{#if reviews}}x{{/if}}`);
		expect([...r.roots].sort()).toEqual(["business", "page", "reviews", "services"]);
		expect(r.includes.map((i) => i.name)).toEqual(["hours"]);
	});

	it("skips comments and leaves plain HTML alone", () => {
		expect(render(`<p>{{! a note }}plain {{text}}</p>`, { text: "ok" })).toBe(`<p>plain ok</p>`);
		expect(render(`<p>no braces here</p>`, {})).toBe(`<p>no braces here</p>`);
	});

	it("reports an unclosed or mismatched block in plain words", () => {
		expect(() => parse(`{{#each services}}x`)).toThrow(TemplateError);
		expect(() => parse(`{{#each services}}x`)).toThrow(/no \{\{\/each\}\}/);
		expect(() => parse(`{{/if}}`)).toThrow(/Unexpected/);
		expect(() => parse(`{{ business phone }}`)).toThrow(/a path like business\.phone/);
	});
});
