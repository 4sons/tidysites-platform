/**
 * What custom HTML can read, and the rendering of it. The context carries
 * `business` (the Business record's fields plus a few derived ones),
 * `site`, `page` (the record this address is for, whatever its collection,
 * with the same names on every kind of page) and any collection the text
 * names, each entry with its `url` and `image`. Only what a text references
 * is loaded, so a row that prints the phone costs one read.
 *
 * Rendering is: fill the values (escaped), sanitise like any row, then put
 * the platform's own markup where the drop-ins were (`{{> menu}}`,
 * `{{> logo}}`, …) and turn `#form:<Name>` links into dialog buttons. A
 * form drop-in comes back as a segment for the Astro layer to render.
 */
import { getEmDashEntry, getMenu } from "emdash";
import { isPortableText, portableTextToHtml } from "../lib/portable-text";
import { paragraphsHtml } from "../lib/text";
import { referenced, render, splitIncludes, hasTemplate, TemplateError, type Include, type Scope } from "../lib/template";
import { sanitizeHtml } from "../lib/sanitize";
import { addressLine, entries, entryUrl, formDialog, getBusiness, getLocation, hoursRows, mediaUrl, pic, resolveRoute, slugify, str, type Business, dateOf, ago } from "./lib";
import { pageType } from "../lib/routes";
import { LOGO_SIZES, mediaSrcset, srcsetForSrc } from "../lib/images";

export type Segment = { html: string } | { form: string; id: string };
export interface Rendered { segments: Segment[]; dialogs: Array<{ id: string; name: string }>; error: string | null }

/** The collections custom HTML may loop over, with the fields that stand for their picture. */
const COLLECTIONS: Record<string, { image: string[] }> = {
	services: { image: ["featured_image", "image"] }, service_categories: { image: ["featured_image", "image"] }, service_areas: { image: ["featured_image", "image"] },
	locations: { image: ["photo", "image"] }, people: { image: ["photo", "image"] }, reviews: { image: ["photo"] }, faqs: { image: [] }, posts: { image: ["featured_image", "image"] },
	audiences: { image: ["featured_image", "image"] }, offers: { image: ["image"] }, plans: { image: [] }, badges: { image: ["image", "logo"] }, brands: { image: ["logo", "image"] },
	products: { image: ["image", "featured_image"] }, case_studies: { image: ["featured_image", "image"] }, clients: { image: ["logo", "image"] }, conditions: { image: ["featured_image"] },
	technologies: { image: ["featured_image", "image"] }, insurers: { image: ["logo"] }, financing_providers: { image: ["logo"] }, policies: { image: [] }, downloads: { image: [] }, forms: { image: [] }
};

/** A stored media value as custom HTML reads it: the value plus `url` and `alt`, so `{{ page.hero_image.url }}` and `{{ s.featured_image.url }}` work. */
const isMedia = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v) && ("storageKey" in (v as Record<string, unknown>) || (typeof (v as Record<string, unknown>).id === "string" && ("provider" in (v as Record<string, unknown>) || "mimeType" in (v as Record<string, unknown>) || "meta" in (v as Record<string, unknown>)))));
function withMediaUrls(data: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(data)) {
		out[k] = isMedia(v) ? { ...v, url: mediaUrl(v) ?? "", alt: typeof v.alt === "string" ? v.alt : "", srcset: mediaSrcset(v) ?? "" } : v;
		// Written content (rich text) prints as HTML through {{{ x.content_html }}}; the blocks themselves stay for loops.
		if (isPortableText(v)) out[`${k}_html`] = portableTextToHtml(v);
		// A plain text field with paragraphs prints as <p>s through {{{ x.summary_html }}}; the text itself stays for {{ x.summary }}.
		else if (typeof v === "string" && v.trim() && !/^(id|slug|status|_type|_key)$/.test(k)) out[`${k}_html`] = paragraphsHtml(v);
		// A date prints ready to read through {{ x.ends_date }} ("Nov 30, 2026") and {{ x.ends_ago }} ("3 days ago"); the raw value stays for sorting.
		if (v instanceof Date || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v))) { out[`${k}_date`] = dateOf(v); out[`${k}_ago`] = ago(v); }
	}
	// The initials of the record's name ("Jane Doe" → "JD"), for an avatar with no photo.
	const name = str(data.display_name) || str(data.title) || str(data.name);
	if (name) out.initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
	// Dates print ready to read: {{ p.published_date }} and {{ p.updated_date }} ("Oct 30, 2026"); the raw values stay for sorting.
	if (data.post_date || data.publishedAt) out.published_date = dateOf(data.post_date || data.publishedAt);
	if (data.updatedAt) out.updated_date = dateOf(data.updatedAt);
	return out;
}

const imageOf = (data: Record<string, unknown>, fields: string[]): { url: string; alt: string; srcset: string } | null => {
	for (const f of fields) {
		const url = mediaUrl(data[f]);
		if (url) return { url, alt: pic(data[f]).image?.alt ?? "", srcset: mediaSrcset(data[f]) ?? "" };
	}
	return null;
};

async function collectionItems(collection: string): Promise<Scope[]> {
	const spec = COLLECTIONS[collection];
	if (!spec) return [];
	const list = await entries(collection, { limit: 100 });
	const cats = collection === "services" ? await entries("service_categories", { limit: 100 }) : [];
	return Promise.all(list.map(async (e) => {
		const data = e.data;
		const cat = cats.find((c) => String(data.category ?? "") === String(c.data.id ?? c.id) || String(data.category ?? "") === c.id);
		return {
			...withMediaUrls(data),
			id: e.id, slug: e.slug ?? null,
			url: (await entryUrl(collection, e)) ?? "",
			image: imageOf(data, spec.image),
			...(cat ? { category_title: str(cat.data.title), category_url: (await entryUrl("service_categories", cat)) ?? "" } : {})
		};
	}));
}

function businessScope(b: Business): Scope {
	return {
		...b.raw,
		title: b.title, tagline: b.tagline, phone: b.phone, phone_href: b.phoneHref, phone_text: b.phoneText, phone_text_href: b.phoneTextHref, email: b.email, email_href: b.email ? `mailto:${b.email}` : "",
		address: b.address, city: b.city, region: b.region, postal: b.postal, country: b.country, address_line: addressLine(b), hours: b.hours, hours_note: b.hoursNote,
		founded_year: b.foundedYear, years_line: b.yearsLine, rating: b.rating, review_count: b.reviewCount, rating_source: b.ratingSource, reviews_url: b.reviewsUrl,
		booking_url: b.bookingUrl || "/contact", booking_label: b.bookingLabel, portal_url: b.portalUrl, portal_label: b.portalLabel, cta_label: b.ctaLabel,
		logo: b.logo ? { url: b.logo.src, alt: b.logo.alt ?? b.title, width: b.logo.width, height: b.logo.height, srcset: mediaSrcset(b.raw.logo) ?? "" } : null,
		logo_dark: b.logoDark ? { url: b.logoDark.src, alt: b.logoDark.alt ?? b.title, width: b.logoDark.width, height: b.logoDark.height, srcset: mediaSrcset(b.raw.logo_dark) ?? "" } : null,
		social: b.social.map((s) => ({ network: s.network, url: s.url, label: s.network.charAt(0).toUpperCase() + s.network.slice(1) })),
		license_line: b.licenseLine, insured_line: b.insuredLine, warranty_line: b.warrantyLine, service_area_line: b.serviceAreaLine, same_day_line: b.sameDayLine, emergency_line: b.emergencyLine
	};
}

const pageMemo = new WeakMap<Request, Promise<Scope>>();
/** The record this address is for, with the same names whatever its kind: title, summary, image, url, collection, kind, plus its own fields. */
export function currentPage(request: Request): Promise<Scope> {
	let p = pageMemo.get(request);
	if (!p) { p = readPage(request); pageMemo.set(request, p); }
	return p;
}
async function readPage(request: Request): Promise<Scope> {
	const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
	const base = { url: path, kind: "page", collection: "", slug: "", title: "", summary: "", image: null as { url: string; alt: string } | null };
	let route: Awaited<ReturnType<typeof resolveRoute>> | null = null;
	let entry: { id?: string; data?: Record<string, unknown> } | undefined;
	let collection = "pages";
	let kind = "page";
	let slug = "";
	if (path === "/") {
		// The home page is the "home" page record: its fields and its hero are page.* like any other page.
		try { entry = ((await getEmDashEntry("pages", "home")) as { entry?: typeof entry }).entry; } catch { entry = undefined; }
		kind = "home"; slug = "home";
		if (!entry) return { ...base, kind, collection, slug, title: "Home" };
	} else {
		try { route = await resolveRoute(path); } catch { route = null; }
		if (!route) return base;
		if (route.kind === "index") { const t = pageType(route.collection); return { ...base, kind: "index", collection: route.collection, title: t?.index?.label ?? route.collection }; }
		if (route.kind === "blog") return { ...base, kind: "blog", collection: "posts", title: "Blog" };
		if (route.kind === "home") return { ...base, kind: "home", collection: "pages", slug: "home", title: "Home" };
		entry = route.entry as { id?: string; data?: Record<string, unknown> } | undefined;
		collection = route.kind === "page" ? "pages" : route.collection;
		kind = route.kind; slug = route.slug;
	}
	const data = entry?.data ?? {};
	const spec = COLLECTIONS[collection] ?? { image: ["featured_image", "image", "photo", "hero_image"] };
	let category: Scope | null = null;
	if (collection === "services" && data.category) {
		const cats = await entries("service_categories", { limit: 100 });
		const c = cats.find((x) => String(data.category) === String(x.data.id ?? x.id) || String(data.category) === x.id);
		if (c) category = { title: str(c.data.title), url: (await entryUrl("service_categories", c)) ?? "" };
	}
	// A page's picture: its own image field, else the first hero section's photo, the way the share image is derived.
	let image: { url: string; alt: string; srcset: string } | null = imageOf(data, [...spec.image, "hero_image", "photo", "image"]);
	if (!image && Array.isArray(data.sections)) {
		const hero = (data.sections as Array<Record<string, unknown>>).find((b) => b && b._type === "hero" && mediaUrl(b.image));
		if (hero) image = { url: mediaUrl(hero.image) ?? "", alt: pic(hero.image).image?.alt ?? "", srcset: mediaSrcset(hero.image) ?? "" };
	}
	return {
		...withMediaUrls(data),
		...base,
		kind, collection, slug, id: entry?.id ?? "",
		title: str(data.title) || (kind === "home" ? "Home" : ""), headline: str(data.headline) || str(data.title), summary: str(data.summary) || str(data.tagline),
		image,
		...(category ? { category } : {})
	};
}

/** A stored file as custom HTML reads it: {{ video.url }}, {{ video.type }}. */
export function fileScope(file: unknown): Scope | null {
	const url = mediaUrl(file);
	if (!url) return null;
	const f = (file && typeof file === "object" ? file : {}) as { mimeType?: unknown; alt?: unknown };
	return { url, type: str(f.mimeType), alt: str(f.alt) };
}

/** A row's own pictures, by the name the HTML uses: {{ media.hero.url }}, {{ media.hero.alt }}, {{ media.hero.srcset }}. */
export function rowMedia(list: unknown): Scope {
	const out: Scope = {};
	if (!Array.isArray(list)) return out;
	for (const item of list as Array<Record<string, unknown>>) {
		const name = str(item?.name).trim();
		if (!name) continue;
		const file = item.image ?? item.file;
		const url = mediaUrl(file) ?? "";
		const f = (file && typeof file === "object" ? file : {}) as { mimeType?: unknown; alt?: unknown; width?: unknown; height?: unknown };
		out[name] = { url, alt: str(item.alt) || str(f.alt), type: str(f.mimeType), width: typeof f.width === "number" ? f.width : null, height: typeof f.height === "number" ? f.height : null, srcset: mediaSrcset(file) ?? "" };
	}
	return out;
}

/** The context a text needs, and no more. `extra` is what the caller adds (a row's own media). */
export async function contextFor(request: Request, text: string, extra: Scope = {}): Promise<{ ctx: Scope; includes: Include[] }> {
	const { roots, includes } = referenced(text);
	const b = await getBusiness(request);
	const ctx: Scope = { ...extra, business: businessScope(b) };
	const url = new URL(request.url);
	ctx.site = { title: b.title, url: url.origin, path: url.pathname, year: new Date().getFullYear() };
	if (roots.has("page")) ctx.page = await currentPage(request);
	await Promise.all([...roots].filter((r) => r in COLLECTIONS).map(async (r) => { ctx[r] = await collectionItems(r); }));
	return { ctx, includes };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
type MenuItem = { label: string; url: string; target?: string | null; children?: MenuItem[] };

// A menu link written with a trailing slash (/about-us/) is the same page as /about-us.
const trim = (u: string) => (u.length > 1 ? u.replace(/\/+$/, "") : u);
const atItem = (i: MenuItem, current: string): boolean => { const u = trim(i.url); return u === "/" ? current === "/" : current === u || current.startsWith(`${u}/`); };
const underItem = (items: MenuItem[], current: string): boolean => items.some((i) => atItem(i, current) || underItem(i.children ?? [], current));

export function menuHtml(items: MenuItem[], current: string, depth: number, level = 1, collapsible = false): string {
	if (!items.length) return "";
	const li = items.map((i) => {
		const kids = i.children ?? [];
		const here = atItem(i, current);
		// The folder a current page sits in is marked as well (ts-menu-ancestor), the way most menus colour the open section.
		const above = !here && underItem(kids, current);
		const sub = kids.length && level < depth ? menuHtml(kids, current, depth, level + 1, collapsible) : "";
		const link = `<a class="ts-menu-link" href="${esc(i.url)}"${i.target ? ` target="${esc(i.target)}"` : ""}${here ? ` aria-current="page"` : ""}>${esc(i.label)}</a>`;
		// Collapsible: an item with children is a <details> whose summary holds the link and a toggle, so a phone drawer folds its submenus without script; the open section starts open.
		const body = collapsible && sub ? `<details class="ts-menu-fold"${here || above ? " open" : ""}><summary class="ts-menu-fold-head">${link}<span class="ts-menu-fold-toggle" aria-hidden="true"></span></summary>${sub}</details>` : `${link}${sub}`;
		return `<li class="ts-menu-item${kids.length ? " ts-menu-has-children" : ""}${here ? " ts-menu-current" : ""}${above ? " ts-menu-ancestor" : ""}">${body}</li>`;
	});
	return `<ul class="${level === 1 ? "ts-menu" : "ts-menu-sub"}">${li.join("")}</ul>`;
}

/** The platform's own markup for a drop-in; null when the name is unknown. */
async function includeHtml(inc: Include, b: Business, request: Request): Promise<string | null> {
	const arg = (i: number, fallback = "") => inc.args[i] ?? fallback;
	switch (inc.name) {
		case "menu": {
			const menu = (await getMenu(arg(0, "primary")).catch(() => null)) as { items?: MenuItem[] } | null;
			const depth = Math.max(1, Math.min(3, Number(inc.named.depth ?? 3) || 3));
			const collapsible = inc.named.collapsible === "true" || inc.named.collapsible === "1";
			return menuHtml(menu?.items ?? [], new URL(request.url).pathname.replace(/\/+$/, "") || "/", depth, 1, collapsible);
		}
		case "logo": {
			const logoSrcset = b.logo ? (mediaSrcset(b.raw.logo) ?? srcsetForSrc(b.logo.src)) : null;
			const inner = b.logo ? `<img class="ts-logo-img" src="${esc(b.logo.src)}"${logoSrcset ? ` srcset="${esc(logoSrcset)}" sizes="${LOGO_SIZES}"` : ""} alt="${esc(b.logo.alt ?? b.title)}"${b.logo.width ? ` width="${b.logo.width}"` : ""}${b.logo.height ? ` height="${b.logo.height}"` : ""}>` : `<span class="ts-logo-text">${esc(b.title)}</span>`;
			return `<a class="ts-logo" href="/">${inner}</a>`;
		}
		case "phone":
			return b.phone ? `<a class="ts-phone" href="${esc(b.phoneHref)}">${esc(arg(0) || b.phone)}</a>` : "";
		case "email":
			return b.email ? `<a class="ts-email" href="mailto:${esc(b.email)}">${esc(arg(0) || b.email)}</a>` : "";
		case "address": {
			const line = addressLine(b);
			return line ? `<address class="ts-address">${esc(line)}</address>` : "";
		}
		case "hours": {
			const loc = await getLocation(arg(0));
			const rows = loc ? hoursRows(loc.data) : [];
			if (rows.length) return `<table class="ts-hours"><tbody>${rows.map((r) => `<tr><th scope="row">${esc(r.day)}</th><td>${esc(r.value)}</td></tr>`).join("")}</tbody></table>`;
			return b.hours ? `<p class="ts-hours-line">${esc(b.hours)}</p>` : "";
		}
		case "social":
			return b.social.length ? `<ul class="ts-social">${b.social.map((s) => `<li><a class="ts-social-link ts-social-${esc(s.network)}" href="${esc(s.url)}" target="_blank" rel="noopener" aria-label="${esc(s.network)}">${esc(s.network.charAt(0).toUpperCase() + s.network.slice(1))}</a></li>`).join("")}</ul>` : "";
		case "year":
			return String(new Date().getFullYear());
		case "button": {
			const label = arg(0, b.ctaLabel), href = arg(1, b.bookingUrl || "/contact");
			const style = inc.named.style ?? arg(2, "primary");
			const cls = `ts-btn ${style === "outline" ? "ts-btn-outline" : style === "plain" ? "" : "ts-btn-accent"} ${inc.named.class ?? ""}`.trim().replace(/\s+/g, " ");
			const fd = formDialog(href);
			return fd ? `<button class="${cls}" type="button" data-tidy-dialog="${esc(fd.id)}" data-ts-form="${esc(fd.name)}">${esc(label)}</button>` : `<a class="${cls}" href="${esc(href)}">${esc(label)}</a>`;
		}
		default:
			return null;
	}
}

/**
 * Custom HTML rendered for the page: values filled, sanitised, drop-ins and
 * `#form:` links in place. `segments` alternate markup with forms for the
 * Astro layer to render; `dialogs` are the forms the buttons open.
 */
export async function renderCustomHtml(text: string, request: Request, extra: Scope = {}): Promise<Rendered> {
	const dialogs = new Map<string, string>();
	let filled = text;
	let includes: Include[] = [];
	let error: string | null = null;
	if (hasTemplate(text)) {
		try {
			const c = await contextFor(request, text, extra);
			includes = c.includes;
			filled = render(text, c.ctx);
		} catch (e) {
			error = e instanceof TemplateError ? e.message : "The custom HTML could not be rendered";
			filled = text.replace(/\{\{[\s\S]*?\}\}/g, "");
		}
	}
	let safe = sanitizeHtml(filled);
	// A link to #form:<Name> opens that form in a dialog on this page, the way a section button does.
	safe = safe.replace(/<a\b([^>]*)\shref="#form:([^"]+)"([^>]*)>/gi, (whole, before: string, name: string, after: string) => {
		const fd = formDialog(`#form:${name}`);
		if (!fd) return whole;
		dialogs.set(fd.id, fd.name);
		return `<button type="button" data-tidy-dialog="${esc(fd.id)}"${before}${after}>`;
	});
	const b = await getBusiness(request);
	const segments: Segment[] = [];
	for (const part of splitIncludes(safe)) {
		if ("html" in part) { segments.push({ html: part.html }); continue; }
		const inc = part.include;
		if (inc.name === "form") {
			const name = inc.args[0] ?? "";
			if (name) segments.push({ form: name, id: `ts-form-${slugify(name)}` });
			continue;
		}
		const html = await includeHtml(inc, b, request);
		if (html === null) continue;
		// A button drop-in that opens a form needs the dialog beside it.
		for (const m of html.matchAll(/data-ts-form="([^"]+)"/g)) { const fd = formDialog(`#form:${m[1]}`); if (fd) dialogs.set(fd.id, fd.name); }
		segments.push({ html: html.replace(/ data-ts-form="[^"]+"/g, "") });
	}
	// A dialog button's closing tag is the anchor's: swap it so the markup stays balanced.
	const fixed = segments.map((s) => ("html" in s ? { html: closeButtons(s.html) } : s));
	return { segments: fixed, dialogs: [...dialogs].map(([id, name]) => ({ id, name })), error };
}

/** After an opening <a> became a <button>, its matching </a> must become </button>. */
function closeButtons(html: string): string {
	const stack: string[] = [];
	return html.replace(/<(\/?)(a|button)\b[^>]*>/gi, (whole, slash: string, tag: string) => {
		const t = tag.toLowerCase();
		if (!slash) { stack.push(t); return whole; }
		const open = stack.pop();
		return open && open !== t ? `</${open}>` : whole;
	});
}

