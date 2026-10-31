import { describe, expect, it } from "vitest";
import { menuHtml } from "../src/sections/context";
import { ago } from "../src/sections/lib";

const items = [
	{ label: "Home", url: "/" },
	{ label: "About", url: "/about-us/" },
	{ label: "Services", url: "/services", children: [{ label: "Repair", url: "/services/repair" }] }
];

describe("menu drop-in", () => {
	it("marks the current page when the link carries a trailing slash", () => {
		const html = menuHtml(items, "/about-us", 3);
		expect(html).toContain(`class="ts-menu-item ts-menu-current"><a class="ts-menu-link" href="/about-us/" aria-current="page">About</a>`);
		expect(html).not.toContain(`ts-menu-current"><a class="ts-menu-link" href="/"`);
	});
	it("folds submenus into <details> when asked, open where the current page sits", () => {
		const html = menuHtml(items, "/services/repair", 3, 1, true);
		expect(html).toContain(`<details class="ts-menu-fold" open><summary class="ts-menu-fold-head"><a class="ts-menu-link" href="/services" aria-current="page">Services</a><span class="ts-menu-fold-toggle" aria-hidden="true"></span></summary><ul class="ts-menu-sub">`);
		expect(menuHtml(items, "/", 3, 1, true)).toContain(`<details class="ts-menu-fold"><summary`);
		expect(menuHtml(items, "/", 3)).not.toContain("<details");
	});
});

describe("ago", () => {
	it("says how long ago in plain words", () => {
		const now = new Date("2026-10-31T12:00:00Z");
		expect(ago("2026-10-31T11:59:40Z", now)).toBe("just now");
		expect(ago("2026-10-31T09:00:00Z", now)).toBe("3 hours ago");
		expect(ago("2026-10-28T12:00:00Z", now)).toBe("3 days ago");
		expect(ago("2026-11-30T12:00:00Z", now)).toBe("in 1 month");
		expect(ago("nope", now)).toBe("");
	});
});
