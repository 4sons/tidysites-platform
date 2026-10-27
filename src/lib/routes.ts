/**
 * Where records render as pages. Every record is data first: a service, an
 * area, a person or a product can be listed anywhere on the site without
 * having an address of its own. A collection that can render pages carries
 * a URL pattern (EmDash's own, `/services/{slug}`, set on the collection and
 * changeable in the admin), each record carries a switch for its page, and
 * the listing at the pattern's prefix is switched on the frame record. The
 * runtime side (patterns read from the site, entries looked up) lives in
 * sections/lib; this file is the pure part: the table, the pattern maths,
 * and the switch rules.
 */

export interface PageType {
	collection: string;
	/** The template's default pattern; the site's own (changed in the admin) wins at runtime. */
	pattern: string;
	/**
	 * The record field that switches its page. A select is "on" unless it says
	 * "off" (a record that never set it has its page); a boolean is off unless
	 * it is true (people and technologies opt in, as they always have).
	 */
	page: { field: string; kind: "select" | "boolean" } | null;
	/** The listing page at the pattern's prefix: the frame field that switches it and the section that renders it. Null when there is none, or when it is always on (the blog). */
	index: { field: string; section: string; label: string } | null;
}

export const PAGE_TYPES: readonly PageType[] = [
	{ collection: "pages", pattern: "/{slug}", page: null, index: null },
	{ collection: "services", pattern: "/services/{slug}", page: { field: "page", kind: "select" }, index: { field: "services_index", section: "services", label: "Services" } },
	{ collection: "service_categories", pattern: "/services/category/{slug}", page: null, index: null },
	{ collection: "service_areas", pattern: "/service-areas/{slug}", page: { field: "page", kind: "select" }, index: { field: "areas_index", section: "areas", label: "Service areas" } },
	{ collection: "audiences", pattern: "/for/{slug}", page: { field: "page", kind: "select" }, index: { field: "audiences_index", section: "audiences", label: "Who we serve" } },
	{ collection: "people", pattern: "/team/{slug}", page: { field: "has_profile", kind: "boolean" }, index: { field: "team_index", section: "team", label: "Team" } },
	{ collection: "conditions", pattern: "/conditions/{slug}", page: { field: "page", kind: "select" }, index: { field: "conditions_index", section: "conditions", label: "Conditions" } },
	{ collection: "products", pattern: "/products/{slug}", page: { field: "page", kind: "select" }, index: { field: "products_index", section: "products", label: "Products" } },
	{ collection: "technologies", pattern: "/technology/{slug}", page: { field: "has_page", kind: "boolean" }, index: { field: "technologies_index", section: "technologies", label: "Technology" } },
	{ collection: "case_studies", pattern: "/case-studies/{slug}", page: { field: "page", kind: "select" }, index: { field: "case_studies_index", section: "case_studies", label: "Work" } },
	{ collection: "posts", pattern: "/blog/{slug}", page: null, index: null }
];

export const pageType = (collection: string): PageType | undefined => PAGE_TYPES.find((t) => t.collection === collection);

/** The addresses a path can be, in the order the themes try them. */
export type Route =
	| { kind: "home" }
	| { kind: "page"; slug: string; /** The slugs of the parents above it, top first, for a page at a nested address. */ parents?: string[] }
	| { kind: "index"; collection: string }
	| { kind: "blog"; base: string; page: number; filter: { kind: "category" | "tag" | "author"; slug: string } | null }
	| { kind: "entry"; collection: string; slug: string };

/** A pattern's placeholders become `([^/]+)` groups, one per segment, as EmDash compiles them. */
export function compilePattern(pattern: string, nested = false): { regex: RegExp; params: string[] } {
	const params: string[] = [];
	let src = "";
	let last = 0;
	for (const m of pattern.matchAll(/\{(\w+)\}/g)) {
		src += escapeRegex(pattern.slice(last, m.index));
		params.push(m[1]!);
		// A nested slug (a page under a parent) carries slashes; every other placeholder is one segment.
		src += nested && m[1] === "slug" ? "(.+)" : "([^/]+)";
		last = m.index + m[0].length;
	}
	src += escapeRegex(pattern.slice(last));
	return { regex: new RegExp(`^${src}$`), params };
}
const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The record's address under a pattern. */
export function entryPath(pattern: string, slug: string): string {
	return pattern.replace(/\{\w+\}/g, encodeURIComponent(slug).replace(/%2F/gi, "/")) || "/";
}

/** The listing's address: the pattern with its last placeholder segment dropped. Null when nothing is left (pages at `/{slug}`). */
export function indexPath(pattern: string): string | null {
	const p = pattern.replace(/\/\{\w+\}\/?$/, "");
	return p && p !== "/" ? p : null;
}

/** The slug a path carries under a pattern, or null when it does not match; `nested` lets the slug span segments (a page under a parent). */
export function matchPattern(pattern: string, path: string, nested = false): string | null {
	const { regex, params } = compilePattern(pattern, nested);
	const m = regex.exec(path);
	if (!m) return null;
	const i = params.indexOf("slug");
	const raw = i >= 0 ? m[i + 1] : m[1];
	if (!raw) return null;
	try { return decodeURIComponent(raw); } catch { return raw; }
}

/** Whether a record of this type has its own page (see PageType.page). */
export function hasPage(type: PageType | undefined, data: Record<string, unknown> | null | undefined): boolean {
	if (!type) return false;
	if (!type.page) return true;
	const v = data?.[type.page.field];
	if (type.page.kind === "select") return v !== "off";
	return v === true || v === 1;
}

/** Whether the listing page of this type is on, from the frame record's switch (unset is on). */
export function indexOn(type: PageType, frame: Record<string, unknown> | null | undefined): boolean {
	if (!type.index) return false;
	return frame?.[type.index.field] !== "off";
}

/** A clean path: one leading slash, no trailing slash, no query or hash. */
export function normalizePath(path: string): string {
	let p = (path.split(/[?#]/)[0] ?? "").trim();
	if (!p.startsWith("/")) p = `/${p}`;
	p = p.replace(/\/{2,}/g, "/");
	if (p.length > 1) p = p.replace(/\/+$/, "");
	return p;
}

/** The blog's other pages under its prefix: `/page/N`, `/category|tag|author/<slug>[/page/N]`. Null when the path is not one. */
export function blogRoute(base: string, path: string): Extract<Route, { kind: "blog" }> | null {
	if (path === base) return { kind: "blog", base, page: 1, filter: null };
	if (!path.startsWith(`${base}/`)) return null;
	const parts = path.slice(base.length + 1).split("/");
	const num = (s: string | undefined): number | null => (s && /^[1-9]\d*$/.test(s) ? Number(s) : null);
	if (parts[0] === "page" && parts.length === 2) { const n = num(parts[1]); return n ? { kind: "blog", base, page: n, filter: null } : null; }
	if ((parts[0] === "category" || parts[0] === "tag" || parts[0] === "author") && parts[1] && (parts.length === 2 || (parts.length === 4 && parts[2] === "page"))) {
		const n = parts.length === 4 ? num(parts[3]) : 1;
		return n ? { kind: "blog", base, page: n, filter: { kind: parts[0], slug: parts[1] } } : null;
	}
	return null;
}

/**
 * The candidates a path can be, given the site's patterns, in the order the
 * runtime checks them: home, then a page by slug, then a listing, then the
 * blog's facets, then a record under each pattern. The runtime takes the
 * first candidate whose record exists and has its page on.
 */
/** How deep a page can sit under parents (a parent's parent's parent). */
export const MAX_PAGE_DEPTH = 4;

export function routeCandidates(path: string, patterns: Record<string, string>, frame: Record<string, unknown> | null | undefined): Route[] {
	const p = normalizePath(path);
	if (p === "/") return [{ kind: "home" }];
	const out: Route[] = [];
	const pagesPattern = patterns.pages ?? "/{slug}";
	const pageSlug = matchPattern(pagesPattern, p, true);
	const chain = pageSlug && pageSlug !== "home" ? pageSlug.split("/").filter(Boolean) : [];
	if (chain.length === 1) out.push({ kind: "page", slug: chain[0]! });
	for (const t of PAGE_TYPES) {
		const pattern = patterns[t.collection] ?? t.pattern;
		if (t.index && indexPath(pattern) === p && indexOn(t, frame)) out.push({ kind: "index", collection: t.collection });
	}
	const postsBase = indexPath(patterns.posts ?? "/blog/{slug}");
	if (postsBase) { const b = blogRoute(postsBase, p); if (b) out.push(b); }
	for (const t of PAGE_TYPES) {
		if (t.collection === "pages") continue;
		const slug = matchPattern(patterns[t.collection] ?? t.pattern, p);
		if (slug) out.push({ kind: "entry", collection: t.collection, slug });
	}
	// A page under a parent, tried last: the records' own patterns answer first.
	if (chain.length > 1 && chain.length <= MAX_PAGE_DEPTH) out.push({ kind: "page", slug: chain[chain.length - 1]!, parents: chain.slice(0, -1) });
	return out;
}
