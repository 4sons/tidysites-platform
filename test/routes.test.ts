import { describe, expect, it } from "vitest";
import { PAGE_TYPES, blogRoute, compilePattern, entryPath, hasPage, indexOn, indexPath, matchPattern, normalizePath, pageType, routeCandidates } from "../src/lib/routes";
import { collections } from "../src/template/index";

describe("routes", () => {
	it("gives every page-bearing collection the pattern the template declares", () => {
		for (const t of PAGE_TYPES) {
			const c = collections.find((x) => x.slug === t.collection);
			expect(c, t.collection).toBeTruthy();
			expect(c!.urlPattern, `${t.collection} urlPattern`).toBe(t.pattern);
			expect(c!.routable, `${t.collection} routable`).toBe(true);
			if (t.page) expect(c!.fields.some((f) => f.slug === t.page!.field), `${t.collection}.${t.page.field}`).toBe(true);
			if (t.index) expect(collections.find((x) => x.slug === "frame")!.fields.some((f) => f.slug === t.index!.field), `frame.${t.index.field}`).toBe(true);
		}
	});
	it("compiles patterns the way EmDash does", () => {
		const { regex, params } = compilePattern("/services/{slug}");
		expect(params).toEqual(["slug"]);
		expect(regex.test("/services/crowns")).toBe(true);
		expect(regex.test("/services/crowns/more")).toBe(false);
		expect(matchPattern("/{slug}", "/about")).toBe("about");
		expect(matchPattern("/{slug}", "/about/team")).toBeNull();
		expect(matchPattern("/for/{slug}", "/for/caf%C3%A9s")).toBe("cafés");
	});
	it("builds a record's and a listing's address", () => {
		expect(entryPath("/services/{slug}", "crowns")).toBe("/services/crowns");
		expect(entryPath("/{slug}", "about")).toBe("/about");
		expect(indexPath("/services/{slug}")).toBe("/services");
		expect(indexPath("/services/category/{slug}")).toBe("/services/category");
		expect(indexPath("/{slug}")).toBeNull();
		expect(normalizePath("services/")).toBe("/services");
		expect(normalizePath("/a//b/?x=1")).toBe("/a/b");
	});
	it("switches a page per record: selects are on unless off, booleans are off unless on", () => {
		expect(hasPage(pageType("services"), {})).toBe(true);
		expect(hasPage(pageType("services"), { page: "off" })).toBe(false);
		expect(hasPage(pageType("people"), {})).toBe(false);
		expect(hasPage(pageType("people"), { has_profile: true })).toBe(true);
		expect(hasPage(pageType("posts"), {})).toBe(true);
		expect(hasPage(pageType("reviews"), {})).toBe(false);
	});
	it("switches a listing on the frame record, on unless off", () => {
		expect(indexOn(pageType("services")!, null)).toBe(true);
		expect(indexOn(pageType("services")!, { services_index: "off" })).toBe(false);
		expect(indexOn(pageType("posts")!, {})).toBe(false);
	});
	it("reads the blog's facet addresses under its prefix", () => {
		expect(blogRoute("/blog", "/blog")).toEqual({ kind: "blog", base: "/blog", page: 1, filter: null });
		expect(blogRoute("/blog", "/blog/page/3")).toMatchObject({ page: 3, filter: null });
		expect(blogRoute("/blog", "/blog/category/print")).toMatchObject({ page: 1, filter: { kind: "category", slug: "print" } });
		expect(blogRoute("/blog", "/blog/tag/paper/page/2")).toMatchObject({ page: 2, filter: { kind: "tag", slug: "paper" } });
		expect(blogRoute("/blog", "/blog/page/0")).toBeNull();
		expect(blogRoute("/blog", "/blog/paper-stocks")).toBeNull();
		expect(blogRoute("/news", "/blog/page/2")).toBeNull();
	});
	it("lists what a path can be, in the order the runtime tries them", () => {
		const patterns = Object.fromEntries(PAGE_TYPES.map((t) => [t.collection, t.pattern]));
		expect(routeCandidates("/", patterns, null)).toEqual([{ kind: "home" }]);
		expect(routeCandidates("/services", patterns, null)).toEqual([{ kind: "page", slug: "services" }, { kind: "index", collection: "services" }]);
		expect(routeCandidates("/services", patterns, { services_index: "off" })).toEqual([{ kind: "page", slug: "services" }]);
		expect(routeCandidates("/services/crowns", patterns, null)).toEqual([{ kind: "entry", collection: "services", slug: "crowns" }, { kind: "page", slug: "crowns", parents: ["services"] }]);
		expect(routeCandidates("/blog/category/print", patterns, null)).toEqual([{ kind: "blog", base: "/blog", page: 1, filter: { kind: "category", slug: "print" } }, { kind: "page", slug: "print", parents: ["blog", "category"] }]);
		expect(routeCandidates("/blog/paper-stocks", patterns, null)).toEqual([{ kind: "entry", collection: "posts", slug: "paper-stocks" }, { kind: "page", slug: "paper-stocks", parents: ["blog"] }]);
		expect(routeCandidates("/home", patterns, null)).toEqual([]);
	});
	it("follows the site's own patterns, a type at the root included", () => {
		const patterns = { ...Object.fromEntries(PAGE_TYPES.map((t) => [t.collection, t.pattern])), service_areas: "/{slug}", posts: "/news/{slug}" };
		expect(routeCandidates("/halifax", patterns, null)).toEqual([{ kind: "page", slug: "halifax" }, { kind: "entry", collection: "service_areas", slug: "halifax" }]);
		expect(routeCandidates("/news", patterns, null)).toEqual([{ kind: "page", slug: "news" }, { kind: "blog", base: "/news", page: 1, filter: null }, { kind: "entry", collection: "service_areas", slug: "news" }]);
		expect(routeCandidates("/service-areas", patterns, null)).toEqual([{ kind: "page", slug: "service-areas" }, { kind: "entry", collection: "service_areas", slug: "service-areas" }]);
	});
});

describe("pages under a parent", () => {
	it("reads a nested address as the last slug with its parents, up to the depth limit", () => {
		const patterns = { pages: "/{slug}" };
		expect(routeCandidates("/service-area/livonia", patterns, null).at(-1)).toEqual({ kind: "page", slug: "livonia", parents: ["service-area"] });
		expect(routeCandidates("/a/b/c/d", patterns, null).at(-1)).toEqual({ kind: "page", slug: "d", parents: ["a", "b", "c"] });
		expect(routeCandidates("/a/b/c/d/e", patterns, null).some((c) => c.kind === "page")).toBe(false);
		expect(routeCandidates("/about", patterns, null)[0]).toEqual({ kind: "page", slug: "about" });
		expect(entryPath("/{slug}", "service-area/livonia")).toBe("/service-area/livonia");
		expect(matchPattern("/{slug}", "/a/b")).toBeNull();
		expect(matchPattern("/{slug}", "/a/b", true)).toBe("a/b");
	});
});
