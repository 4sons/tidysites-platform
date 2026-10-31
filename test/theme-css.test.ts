import { describe, expect, it } from "vitest";
import { guardSelector, keepOutOfRows, ownsClass, themeCssPlugin } from "../src/lib/theme-css";

describe("keepOutOfRows", () => {
	it("guards the theme's class rules and leaves element and package rules alone", () => {
		const css = `*{box-sizing:border-box}p{margin:0}.sr{clip:rect(0 0 0 0)}.hero .wrap,.ts-btn.big{display:grid}.ts .ts-card h3{margin:0}`;
		expect(keepOutOfRows(css)).toBe(`*{box-sizing:border-box}p{margin:0}.sr:where(:not(.ts-row *)){clip:rect(0 0 0 0)}.hero .wrap:where(:not(.ts-row *)),.ts-btn.big:where(:not(.ts-row *)){display:grid}.ts .ts-card h3{margin:0}`);
	});
	it("puts the guard before a pseudo-element and walks media queries, not keyframes", () => {
		expect(guardSelector(`.agg .bar i::after`)).toBe(`.agg .bar i:where(:not(.ts-row *))::after`);
		expect(guardSelector(`.card:hover`)).toBe(`.card:hover:where(:not(.ts-row *))`);
		expect(guardSelector(`a:focus-visible`)).toBe(`a:focus-visible`);
		expect(keepOutOfRows(`@media (max-width:980px){.hero .wrap{grid-template-columns:1fr}}@keyframes spin{from{opacity:0}.x{opacity:1}}`)).toBe(`@media (max-width:980px){.hero .wrap:where(:not(.ts-row *)){grid-template-columns:1fr}}@keyframes spin{from{opacity:0}.x{opacity:1}}`);
	});
	it("keeps commas inside :is() together", () => {
		expect(keepOutOfRows(`:is(.a,.b) h2,.c{x:y}`)).toBe(`:is(.a,.b) h2:where(:not(.ts-row *)),.c:where(:not(.ts-row *)){x:y}`);
	});
	it("knows which classes the theme owns", () => {
		expect(ownsClass(`.ts-row .ts-btn`)).toBe(false);
		expect(ownsClass(`.ts .hero`)).toBe(true);
		expect(ownsClass(`[class="x"]`)).toBe(false);
	});
	it("transforms only the theme's own stylesheets", () => {
		const p = themeCssPlugin();
		expect(p.transform(`.sr{x:y}`, "/site/src/styles/theme.css")?.code).toBe(`.sr:where(:not(.ts-row *)){x:y}`);
		expect(p.transform(`.sr{x:y}`, "/site/node_modules/@tideworthy/tidysites-platform/src/sections/defaults.css")).toBeNull();
		expect(p.transform(`.sr{x:y}`, "/site/src/custom/global.css")).toBeNull();
	});
});
