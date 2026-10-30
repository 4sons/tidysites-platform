/** Helpers every section component shares: reading a stored block, images, lists, and the business record. */
import { getCollectionInfo, getEmDashCollection, getEmDashEntry, getSiteSettings } from "emdash";
import { adobeKitId } from "../lib/providers";
import { MAX_PAGE_DEPTH, PAGE_TYPES, entryPath, hasPage, indexLive, indexOn, indexPath, normalizePath, pageType, routeCandidates, type PageType, type Route } from "../lib/routes";
import { pageSeo, type Crumb, type Identity, type PageSeo } from "../lib/seo";
export type { PageSeo, Crumb } from "../lib/seo";
export { PAGE_TYPES, pageType, hasPage, indexPath, entryPath, normalizePath, type Route, type PageType } from "../lib/routes";

export type Node = Record<string, unknown>;

/** A section component receives the stored block as `value`; a Portable Text renderer passes `node`; accept both or the props themselves. */
export function nodeOf(props: Record<string, unknown>): Node {
	return (props.value as Node | undefined) ?? (props.node as Node | undefined) ?? props;
}
export const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
export const bool = (v: unknown, fallback = false): boolean => (typeof v === "boolean" ? v : typeof v === "number" ? v !== 0 : fallback);
export const int = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : fallback);
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
/** A section's rich copy (its `copy` field), as blocks for <PortableText>; empty when none. */
export const rich = (v: unknown): unknown[] => (Array.isArray(v) && v.length ? v : []);
export const lines = (v: unknown): string[] => str(v).split("\n").map((s) => s.trim()).filter(Boolean);
export const list = <T = Record<string, unknown>>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
export const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
/**
 * A button whose link is `#form:<Form name>` opens that form in a dialog
 * instead of going anywhere (sections/Action.astro renders the button and
 * the dialog). Returns the form's name and the dialog's id, or null for an
 * ordinary link.
 */
export function formDialog(href: unknown): { name: string; id: string } | null {
	const m = /^#?form:(.+)$/i.exec(typeof href === "string" ? href.trim() : "");
	if (!m || !m[1]!.trim()) return null;
	const name = m[1]!.trim();
	return { name, id: `ts-form-${slugify(name) || "form"}` };
}

/** An image field's value: a media value, or a plain URL left from an older site. */
export type Pic = { image: { id?: string; src?: string; alt?: string; width?: number; height?: number } | null; url: string | null };
export function pic(v: unknown): Pic {
	if (typeof v === "string") return { image: null, url: v || null };
	if (v && typeof v === "object") {
		const o = v as { id?: string; src?: string; url?: string; alt?: string; width?: number; height?: number; meta?: { storageKey?: string } };
		if (o.id || o.src) return { image: o, url: null };
		const url = o.url ?? (o.meta?.storageKey ? `/_emdash/api/media/file/${o.meta.storageKey}` : null);
		return { image: null, url };
	}
	return { image: null, url: null };
}
export const hasPic = (v: unknown): boolean => { const p = pic(v); return Boolean(p.image || p.url); };
/** A plain URL for an image field, for <img> tags: the stored file (by its storage key), a `src` when one is set, or a plain URL left from an older site. */
export function mediaUrl(v: unknown): string | null {
	const p = v && typeof v === "object" && "image" in (v as object) && "url" in (v as object) ? (v as Pic) : pic(v);
	if (p.url) return p.url;
	const img = p.image as ({ src?: string; meta?: { storageKey?: string } } | null);
	if (img?.src) return img.src;
	if (img?.meta?.storageKey) return `/_emdash/api/media/file/${img.meta.storageKey}`;
	return null;
}

/** "Label: value" lines into pairs. */
export function facts(v: unknown): Array<[string, string]> {
	return lines(v).map((l) => { const i = l.indexOf(":"); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : ["", l]; });
}
/** "Title|Text" lines into steps. */
export function steps(v: unknown): Array<{ title: string; text: string }> {
	return lines(v).map((l) => { const i = l.indexOf("|"); return i > 0 ? { title: l.slice(0, i).trim(), text: l.slice(i + 1).trim() } : { title: l, text: "" }; });
}
export function telHref(phone: string): string {
	const digits = phone.replace(/[^\d+]/g, "");
	if (!digits) return "";
	return `tel:${digits.startsWith("+") ? digits : digits.length === 10 ? `+1${digits}` : digits}`;
}

/** An entry from a collection read, as the sections see it. */
export interface Entry { id: string; slug?: string | null; data: Record<string, unknown> }
type Query = { status?: "published" | "draft"; limit?: number; orderBy?: Record<string, "asc" | "desc">; where?: Record<string, string> };

/** Published entries of a collection, sorted by `sort` when the collection has it; empty when the collection is missing on an older site. */
export async function entries(collection: string, q: Query = {}): Promise<Entry[]> {
	try {
		const r = await getEmDashCollection(collection, { status: "published", orderBy: { sort: "asc" }, ...q } as never);
		return ((r as { entries?: Entry[] }).entries ?? []) as Entry[];
	} catch {
		return [];
	}
}
/** Entries that pass a where filter plus an in-memory predicate (EmDash filters take strings only). */
export async function entriesWhere(collection: string, where: Record<string, string>, q: Query = {}): Promise<Entry[]> {
	return entries(collection, Object.keys(where).length ? { ...q, where } : q);
}
export const field = (e: Entry, k: string): string => str(e.data[k]);
/** The id a reference field points at: the entry's internal id, which differs from its slug (what `entry.id` carries on a collection read). */
export const refId = (e: Entry): string => String(e.data.id ?? e.id);
/** Whether a reference field's stored value points at this entry. */
export const refersTo = (value: unknown, e: Entry): boolean => value !== undefined && value !== null && (String(value) === refId(e) || String(value) === String(e.id));

/** The business record, normalized to what sections and layouts read. Field names follow the template; older pest-era names are read too. */
export interface Business {
	id: string | null;
	title: string; tagline: string;
	phone: string; phoneHref: string; phoneText: string; phoneTextHref: string; fax: string; email: string;
	address: string; city: string; region: string; postal: string; country: string; hideAddress: boolean; isServiceArea: boolean;
	hours: string; hoursNote: string;
	foundedYear: number | null; yearsLine: string; sinceLine: string | null;
	rating: number | null; reviewCount: number | null; ratingSource: string; reviewsUrl: string;
	bookingUrl: string; bookingLabel: string; portalUrl: string; formsUrl: string; storeUrl: string; storeLabel: string; ctaLabel: string;
	languages: string; newPatientsLine: string; neighbourhoods: string; serviceAreaLine: string; sameDayLine: string; emergencyLine: string;
	insuranceLine: string; governmentPrograms: string; hsaFsaLine: string; licenseLine: string; insuredLine: string; warrantyLine: string; accessibilityLine: string; parkingLine: string; directionsLine: string;
	social: Array<{ network: string; url: string }>;
	brandPrimary: string; brandAccent: string; fontDisplay: string; fontBody: string;
	/** Surface tokens, empty when the site leaves them to the theme. */
	brandGround: string; brandSurface: string; brandInk: string;
	brandRadius: BrandRadius; brandDensity: BrandScale; brandTypeScale: BrandScale; brandWidth: BrandWidth;
	/** Header actions: the booking button, what it opens, the portal button, and whether the phone shows. */
	bookingOpens: "link" | "form" | "embed"; bookingForm: string; portalLabel: string; headerPhone: boolean;
	/** The bar at the bottom of a phone screen and the line above the header. */
	callBar: "call and book" | "call only" | "book only" | "off"; topBarText: string; topBarLink: string;
	/** Buttons the frame record adds beside the booking button. */
	headerButtons: Array<{ label: string; url: string; style: "primary" | "outline" | "plain" }>;
	/** Third parties by id (or the pasted embed the id is read from): see lib/providers. */
	chatProvider: string; chatId: string; reviewsWidget: string; reviewsWidgetId: string; bookingEmbed: string; bookingEmbedId: string; metaPixelId: string; googleAdsId: string;
	instagramWidget: string; instagramWidgetId: string; accessibilityWidget: string; accessibilityWidgetId: string;
	callTracking: string; callTrackingId: string; heatmaps: string; heatmapsId: string; tiktokPixelId: string; linkedinInsightId: string; adobeFontsKit: string;
	/** Uploaded font files (urls), the cookie banner, and the blog's page size, from the frame record. */
	displayFontFile: string; bodyFontFile: string;
	cookieBanner: boolean; cookieText: string; cookiePolicyUrl: string; cookieAcceptLabel: string; cookieDeclineLabel: string; blogPageSize: number;
	footerServicesLabel: string; footerServices: boolean; footerMenuLabel: string; siteLanguage: string;
	/** The pop-up the frame opens on its own: what, when, how often. */
	/** A custom row that stands in for the site's header or footer everywhere; a page may say otherwise. */
	headerRow: string; footerRow: string;
	popupShows: "nothing" | "an offer" | "a form"; popupTitle: string; popupOffer: string; popupForm: string; popupTrigger: "on arrival" | "after ten seconds" | "after thirty seconds" | "after scrolling halfway" | "on leaving"; popupEvery: "once a visit" | "once a day" | "every time";
	logo: { src: string; alt?: string; width?: number; height?: number } | null;
	ga4Id: string; gtmId: string; gtmId2: string; customCss: string;
	/** Structured data: the business type (Dentist, Plumber...), the price range, and the frame record's own JSON-LD for the business when it replaces the generated one. */
	schemaType: string; priceRange: string; siteSchema: string;
	/** The frame record's wording lines (Original => Replacement): the site's own words for the fixed labels every theme prints. */
	wording: Record<string, string>;
	raw: Record<string, unknown>;
}
/** Empty means the record leaves it to the theme. */
export type BrandRadius = "" | "sharp" | "soft" | "rounded" | "pill";
export type BrandScale = "" | "compact" | "regular" | "airy" | "large";
export type BrandWidth = "" | "narrow" | "regular" | "wide";
const NETWORKS = ["facebook", "instagram", "google", "youtube", "linkedin", "tiktok", "yelp"];
const pickOne = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);
const hex = (v: unknown): string => (typeof v === "string" && /^#?[0-9a-f]{6}$/i.test(v.trim()) ? (v.trim().startsWith("#") ? v.trim() : `#${v.trim()}`) : "");
function mediaSrc(v: unknown): Business["logo"] {
	const src = mediaUrl(v); if (!src) return null;
	const img = pic(v).image;
	return { src, alt: img?.alt, width: img?.width, height: img?.height };
}
/** A buttons repeater (label, url, style) as the sections and the frame render it; rows without a label are skipped. */
export function buttonsOf(v: unknown): Array<{ label: string; url: string; style: "primary" | "outline" | "plain" }> {
	return list<Record<string, unknown>>(v).map((x) => ({ label: str(x.label), url: str(x.url) || "/contact", style: pickOne(x.style, ["primary", "outline", "plain"], "primary") })).filter((x) => x.label);
}
/** The classes a button style wears. */
export const buttonClass = (style: "primary" | "outline" | "plain", size = ""): string => `ts-btn ${style === "primary" ? "ts-btn-accent" : style === "outline" ? "ts-btn-outline" : ""} ${size}`.replace(/\s+/g, " ").trim();
/** The one published record of a one-record collection, or nothing on a site that lacks it. */
async function oneRecord(collection: string): Promise<Entry | null> {
	try {
		const r = await getEmDashCollection(collection, { status: "published", limit: 1 } as never);
		return ((r as { entries?: Entry[] }).entries ?? [])[0] ?? null;
	} catch { return null; }
}
/**
 * The business record plus its two companions, read together. D1 allows a
 * table 100 columns and EmDash gives every field one, so the Business
 * collection stays under 75 fields (test/template.test.ts holds the line)
 * and the header and footer settings and the third parties live in their
 * own one-record collections, `frame` and `integrations`.
 */
async function readBusiness(): Promise<Business> {
	let d: Record<string, unknown> = {}; let id: string | null = null; let siteTitle = "";
	try { const s = (await getSiteSettings()) as { title?: string } | null; siteTitle = s?.title ?? ""; } catch { /* no settings yet */ }
	const [biz, frame, integrations] = await Promise.all([oneRecord("business"), oneRecord("frame"), oneRecord("integrations")]);
	if (biz) { d = biz.data; id = biz.id; }
	const fr = frame?.data ?? {}; const ig = integrations?.data ?? {};
	const s = (k: string, alt?: string) => str(d[k]) || (alt ? str(d[alt]) : "");
	const phone = s("phone"); const phoneText = s("phone_text");
	const founded = num(d.founded_year);
	const city = s("city");
	const primary = s("brand_primary") || "#1e5a46"; const accent = s("brand_accent") || "#e8b23a";
	return {
		id, title: s("title") || siteTitle || "Our business", tagline: s("tagline"),
		phone, phoneHref: telHref(phone), phoneText, phoneTextHref: phoneText ? `sms:${phoneText.replace(/[^\d+]/g, "")}` : "", fax: s("fax"), email: s("email"),
		address: s("address"), city, region: s("region"), postal: s("postal"), country: s("country"), hideAddress: bool(d.hide_address), isServiceArea: bool(d.is_service_area_business),
		hours: s("hours"), hoursNote: s("hours_note"),
		foundedYear: founded, yearsLine: s("years_line"), sinceLine: city && founded ? `${city} since ${founded}` : city || null,
		rating: num(d.rating), reviewCount: num(d.review_count), ratingSource: s("rating_source") || "Google", reviewsUrl: s("reviews_url"),
		bookingUrl: s("booking_url"), bookingLabel: s("booking_label") || "Book online", portalUrl: s("portal_url"), formsUrl: s("forms_url"), storeUrl: s("store_url"), storeLabel: s("store_label") || "Shop", ctaLabel: s("cta_label") || "Get in touch",
		languages: s("languages"), newPatientsLine: s("new_patients_line"), neighbourhoods: s("neighbourhoods"), serviceAreaLine: s("service_area_line"), sameDayLine: s("same_day_line", "same_day_note"), emergencyLine: s("emergency_line"),
		insuranceLine: s("insurance_line"), governmentPrograms: s("government_programs"), hsaFsaLine: s("hsa_fsa_line"), licenseLine: s("license_line"), insuredLine: s("insured_line"), warrantyLine: s("warranty_line"), accessibilityLine: s("accessibility_line"), parkingLine: s("parking_line"), directionsLine: s("directions_line"),
		social: NETWORKS.map((n) => ({ network: n, url: s(n) })).filter((x) => x.url),
		brandPrimary: primary, brandAccent: accent, fontDisplay: s("font_display") || "Bricolage Grotesque", fontBody: s("font_body") || "Public Sans",
		brandGround: hex(d.brand_ground), brandSurface: hex(d.brand_surface), brandInk: hex(d.brand_ink),
		brandRadius: pickOne(d.brand_radius, ["sharp", "soft", "rounded", "pill"], ""), brandDensity: pickOne(d.brand_density, ["compact", "regular", "airy"], ""), brandTypeScale: pickOne(d.brand_type_scale, ["compact", "regular", "large"], ""), brandWidth: pickOne(d.brand_width, ["narrow", "regular", "wide"], ""),
		bookingOpens: s("booking_opens") === "a form on this site" ? "form" : s("booking_opens") === "the booking embed" ? "embed" : "link", bookingForm: s("booking_form"), portalLabel: s("portal_label") || "Log in", headerPhone: bool(d.header_phone, true),
		callBar: pickOne(fr.call_bar, ["call and book", "call only", "book only", "off"], "call and book"), topBarText: str(fr.top_bar_text), topBarLink: str(fr.top_bar_link),
		headerButtons: buttonsOf(fr.header_buttons),
		chatProvider: str(ig.chat_provider), chatId: str(ig.chat_id), reviewsWidget: str(ig.reviews_widget), reviewsWidgetId: str(ig.reviews_widget_id), bookingEmbed: str(ig.booking_embed), bookingEmbedId: str(ig.booking_embed_id), metaPixelId: str(ig.meta_pixel_id), googleAdsId: str(ig.google_ads_id),
		instagramWidget: str(ig.instagram_widget), instagramWidgetId: str(ig.instagram_widget_id), accessibilityWidget: str(ig.accessibility_widget), accessibilityWidgetId: str(ig.accessibility_widget_id),
		callTracking: str(ig.call_tracking), callTrackingId: str(ig.call_tracking_id), heatmaps: str(ig.heatmaps), heatmapsId: str(ig.heatmaps_id), tiktokPixelId: str(ig.tiktok_pixel_id), linkedinInsightId: str(ig.linkedin_insight_id), adobeFontsKit: str(ig.adobe_fonts_kit),
		displayFontFile: mediaUrl(fr.display_font_file) ?? "", bodyFontFile: mediaUrl(fr.body_font_file) ?? "",
		cookieBanner: fr.cookie_banner === "on", cookieText: str(fr.cookie_text), cookiePolicyUrl: str(fr.cookie_policy_url), cookieAcceptLabel: str(fr.cookie_accept_label), cookieDeclineLabel: str(fr.cookie_decline_label), blogPageSize: int(fr.blog_page_size, 12),
		footerServicesLabel: str(fr.footer_services_label), footerServices: fr.footer_services !== "off", footerMenuLabel: str(fr.footer_menu_label), siteLanguage: str(fr.site_language) || "en",
		headerRow: str(fr.header_row), footerRow: str(fr.footer_row),
		popupShows: pickOne(fr.popup_shows, ["nothing", "an offer", "a form"], "nothing"), popupTitle: str(fr.popup_title), popupOffer: str(fr.popup_offer), popupForm: str(fr.popup_form), popupTrigger: pickOne(fr.popup_trigger, ["on arrival", "after ten seconds", "after thirty seconds", "after scrolling halfway", "on leaving"], "after ten seconds"), popupEvery: pickOne(fr.popup_every, ["once a visit", "once a day", "every time"], "once a visit"),
		logo: mediaSrc(d.logo), ga4Id: s("ga4_id"), gtmId: s("gtm_id"), gtmId2: str(ig.gtm_id_2), customCss: s("custom_css"), schemaType: s("schema_type"), priceRange: s("price_range"), siteSchema: str(fr.site_schema), wording: parseWording(fr.wording), raw: d,
	};
}
/** "Original => Replacement" lines into a map; a line without the arrow, or with an empty side, is skipped. */
export function parseWording(v: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	for (const l of lines(v)) {
		const i = l.indexOf("=>"); if (i <= 0) continue;
		const from = l.slice(0, i).trim(), to = l.slice(i + 2).trim();
		if (from && to) out[from] = to;
	}
	return out;
}
/**
 * The site's own words for a fixed label: `const tx = await wording(Astro.request)`
 * in a component, then `{tx("Call or text")}` in its markup. The frame record's
 * `wording` lines replace a label everywhere it is printed; the original is the
 * key, so a theme change never loses the site's words. Every label a component
 * passes through here is listed in lib/strings (the catalog `/_tidy/strings` serves).
 */
export async function wording(request: Request): Promise<(label: string) => string> {
	const b = await getBusiness(request);
	return (label) => b.wording[label] ?? label;
}
const memo = new WeakMap<Request, Promise<Business>>();
/** One read per request, however many sections ask. */
export function getBusiness(request: Request): Promise<Business> {
	let p = memo.get(request);
	if (!p) { p = readBusiness(); memo.set(request, p); }
	return p;
}
/** Text contrast for a background colour. */
export function inkFor(hex: string): string {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return "#ffffff";
	const n = parseInt(m[1]!, 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#111111" : "#ffffff";
}
/** The brand tokens a business record sets on <html>; a theme's tokens.css reads them with fallbacks (see README, "Tokens"). */
export function brandTokens(b: Business): Record<string, string> {
	const font = (name: string, fallback: string) => `"${name.replace(/"/g, "")}", ${fallback}`;
	const t: Record<string, string> = {
		"--brand-primary": b.brandPrimary, "--brand-primary-ink": inkFor(b.brandPrimary),
		"--brand-accent": b.brandAccent, "--brand-accent-ink": inkFor(b.brandAccent),
		"--brand-font-display": font(b.displayFontFile ? "Brand Display" : b.fontDisplay, "Arial, sans-serif"), "--brand-font-body": font(b.bodyFontFile ? "Brand Body" : b.fontBody, '"Helvetica Neue", Arial, sans-serif'),
	};
	if (b.brandRadius) t["--brand-radius"] = { sharp: "2px", soft: "10px", rounded: "18px", pill: "28px" }[b.brandRadius];
	if (b.brandDensity) t["--brand-space"] = { compact: "clamp(36px,5vw,64px)", regular: "clamp(48px,7vw,96px)", airy: "clamp(64px,9vw,128px)", large: "clamp(64px,9vw,128px)" }[b.brandDensity];
	if (b.brandTypeScale) t["--brand-type"] = { compact: "0.94", regular: "1", large: "1.08", airy: "1" }[b.brandTypeScale];
	if (b.brandWidth) t["--brand-max"] = { narrow: "1040px", regular: "1180px", wide: "1320px" }[b.brandWidth];
	if (b.brandGround) t["--brand-ground"] = b.brandGround;
	if (b.brandSurface) t["--brand-surface"] = b.brandSurface;
	if (b.brandInk) {
		t["--brand-ink"] = b.brandInk;
		const ground = b.brandGround || "#ffffff";
		t["--brand-ink-2"] = `color-mix(in srgb, ${b.brandInk} 74%, ${ground})`;
		t["--brand-ink-3"] = `color-mix(in srgb, ${b.brandInk} 52%, ${ground})`;
		t["--brand-line"] = `color-mix(in srgb, ${b.brandInk} 16%, ${ground})`;
	}
	return t;
}
/** Inline style for <html>: the brand tokens from the business record. */
export function brandStyle(b: Business): string {
	return Object.entries(brandTokens(b)).map(([k, v]) => `${k}:${v}`).join(";");
}
/** Every stylesheet the brand fonts need: Google for the named families, Adobe when a kit is set. Uploaded files come as @font-face from fontFaces(). */
export function fontLinks(b: Business): string[] {
	const links = [fontsHref(b)];
	const kit = adobeKitId(b.adobeFontsKit);
	if (kit) links.push(`https://use.typekit.net/${kit}.css`);
	return links;
}
/** @font-face rules for uploaded font files; the family names "Brand Display" and "Brand Body" then take over the tokens. */
export function fontFaces(b: Business): string {
	const face = (family: string, url: string) => `@font-face{font-family:"${family}";src:url("${url.replace(/"/g, "")}") format("woff2");font-display:swap}`;
	return [b.displayFontFile ? face("Brand Display", b.displayFontFile) : "", b.bodyFontFile ? face("Brand Body", b.bodyFontFile) : ""].join("");
}
/** Google Fonts stylesheet for the two brand families. */
export function fontsHref(b: Business): string {
	const fam = (name: string, axes: string) => `family=${encodeURIComponent(name).replace(/%20/g, "+")}:${axes}`;
	return `https://fonts.googleapis.com/css2?${fam(b.fontDisplay, "wght@600;700;800")}&${fam(b.fontBody, "wght@400;500;600;700")}&display=swap`;
}
/** The one line of address a section prints. */
export function addressLine(b: { address: string; city: string; region: string; postal: string; hideAddress?: boolean }): string {
	if (b.hideAddress) return [b.city, b.region].filter(Boolean).join(", ");
	return [b.address, [b.city, b.region].filter(Boolean).join(", "), b.postal].filter(Boolean).join(", ");
}
/** Hours rows of a location record (hours_mon..hours_sun), grouped when identical days follow each other. */
export const DAYS: Array<[string, string]> = [["hours_mon", "Monday"], ["hours_tue", "Tuesday"], ["hours_wed", "Wednesday"], ["hours_thu", "Thursday"], ["hours_fri", "Friday"], ["hours_sat", "Saturday"], ["hours_sun", "Sunday"]];
export function hoursRows(d: Record<string, unknown>): Array<{ day: string; value: string }> {
	return DAYS.map(([k, day]) => ({ day, value: str(d[k]) })).filter((r) => r.value);
}
export function hoursGrouped(d: Record<string, unknown>): Array<{ days: string; value: string }> {
	const rows = hoursRows(d); const out: Array<{ days: string[]; value: string }> = [];
	for (const r of rows) { const last = out[out.length - 1]; if (last && last.value === r.value) last.days.push(r.day); else out.push({ days: [r.day], value: r.value }); }
	return out.map((g) => ({ days: g.days.length > 2 ? `${g.days[0]} to ${g.days[g.days.length - 1]}` : g.days.join(" and "), value: g.value }));
}
export const todayKey = (): string => DAYS[(new Date().getDay() + 6) % 7]![0];

/** A form record as the Form component renders it. */
export interface FormRecord { id: string; slug: string | null; title: string; data: Record<string, unknown> }
/** The form a section or the header names: by slug, by id, or by title, case-insensitively. Null when the site has no such form. */
export async function getForm(name: string): Promise<FormRecord | null> {
	const want = name.trim().toLowerCase();
	if (!want) return null;
	const all = await entries("forms", { limit: 100 });
	const e = all.find((f) => [f.slug, f.id, refId(f), field(f, "title")].some((v) => typeof v === "string" && v.toLowerCase() === want));
	return e ? { id: refId(e), slug: e.slug ?? null, title: field(e, "title"), data: e.data } : null;
}

/** A location record by name or slug, or the primary one (or the first) when no name is given. Null on a site with none. */
export async function getLocation(name = ""): Promise<Entry | null> {
	const all = await entries("locations", { limit: 50 });
	const want = name.trim().toLowerCase();
	if (want) return all.find((l) => [l.slug, l.id, field(l, "title")].some((v) => typeof v === "string" && v.toLowerCase() === want)) ?? null;
	return all.find((l) => bool(l.data.is_primary)) ?? all[0] ?? null;
}
/** An offer record by name or slug, or null. */
export async function getOffer(name: string): Promise<Entry | null> {
	const want = name.trim().toLowerCase();
	if (!want) return null;
	const all = await entries("offers", { limit: 50 });
	return all.find((o) => [o.slug, o.id, refId(o), field(o, "title")].some((v) => typeof v === "string" && v.toLowerCase() === want)) ?? null;
}

/** A custom row record by name, slug or id, or null. */
export async function getRow(name: string): Promise<Entry | null> {
	const want = name.trim().toLowerCase();
	if (!want) return null;
	const all = await entries("rows", { limit: 100 });
	return all.find((r) => [r.slug, r.id, refId(r), field(r, "title")].some((v) => typeof v === "string" && v.toLowerCase() === want)) ?? null;
}
/** What a page wants for its header and footer: the site's, none, or a named custom row. A page that says nothing gets the site's (which may itself be a row). */
export type FrameChoice = { kind: "site" } | { kind: "none" } | { kind: "row"; name: string };
export function pageFrame(data: Record<string, unknown> | null | undefined): { header: FrameChoice; footer: FrameChoice } {
	const pick = (choice: unknown, row: unknown): FrameChoice => {
		if (choice === "none") return { kind: "none" };
		if (choice === "a custom row" && typeof row === "string" && row.trim()) return { kind: "row", name: row.trim() };
		return { kind: "site" };
	};
	return { header: pick(data?.header, data?.header_row), footer: pick(data?.footer, data?.footer_row) };
}

/** The blog, filtered and paged: by category, tag or author (as slugs of their names), with the frame record's page size. */
export interface BlogPage { posts: Entry[]; page: number; pages: number; total: number; filter: { kind: "category" | "tag" | "author"; slug: string; label: string } | null }
export async function blogPage(opts: { page?: number; category?: string; tag?: string; author?: string; size?: number } = {}): Promise<BlogPage> {
	const [all, people] = await Promise.all([entries("posts", { limit: 500, orderBy: { published_at: "desc" } as never }), entries("people", { limit: 100 })]);
	const tagsOf = (p: Entry) => str(p.data.tags).split(",").map((t) => t.trim()).filter(Boolean);
	const authorOf = (p: Entry) => authorName(people, p.data.author);
	let posts = all; let filter: BlogPage["filter"] = null;
	if (opts.category) { posts = all.filter((p) => slugify(str(p.data.category)) === opts.category); filter = { kind: "category", slug: opts.category, label: str(posts[0]?.data.category) || opts.category }; }
	else if (opts.tag) { posts = all.filter((p) => tagsOf(p).some((t) => slugify(t) === opts.tag)); filter = { kind: "tag", slug: opts.tag, label: posts.flatMap(tagsOf).find((t) => slugify(t) === opts.tag) ?? opts.tag }; }
	else if (opts.author) { posts = all.filter((p) => slugify(authorOf(p)) === opts.author); filter = { kind: "author", slug: opts.author, label: (posts[0] && authorOf(posts[0])) || opts.author }; }
	const size = Math.max(1, opts.size ?? 12);
	const pages = Math.max(1, Math.ceil(posts.length / size));
	const page = Math.min(Math.max(1, opts.page ?? 1), pages);
	return { posts: posts.slice((page - 1) * size, page * size), page, pages, total: posts.length, filter };
}
/** The categories, tags and authors across the blog, each with its slug and count, for the sidebar and the index. */
export async function blogFacets(): Promise<{ categories: Array<{ label: string; slug: string; count: number }>; tags: Array<{ label: string; slug: string; count: number }>; authors: Array<{ label: string; slug: string; count: number }> }> {
	const [all, people] = await Promise.all([entries("posts", { limit: 500 }), entries("people", { limit: 100 })]);
	const tally = (values: string[]) => { const m = new Map<string, { label: string; slug: string; count: number }>(); for (const v of values) { const slug = slugify(v); if (!slug) continue; const cur = m.get(slug) ?? { label: v, slug, count: 0 }; cur.count++; m.set(slug, cur); } return [...m.values()].sort((a, b) => b.count - a.count); };
	return { categories: tally(all.map((p) => str(p.data.category))), tags: tally(all.flatMap((p) => str(p.data.tags).split(",").map((t) => t.trim()))), authors: tally(all.map((p) => authorName(people, p.data.author))) };
}
/** A post's author as a name: the people record it references (by id or title), or the plain text. */
export function authorName(people: Entry[], v: unknown): string {
	const raw = typeof v === "object" && v && "id" in v ? str((v as { id?: unknown }).id) : str(v);
	if (!raw) return "";
	const hit = people.find((p) => p.id === raw || str(p.data.id) === raw || str(p.data.title) === raw);
	return hit ? str(hit.data.title) : raw;
}

/** The page's language and its translations for <html lang> and hreflang: pages sharing a title through `translation_of`. */
export async function pageLanguages(b: Business, data: Record<string, unknown> | null | undefined, origin: string): Promise<{ lang: string; alternates: Array<{ lang: string; href: string }> }> {
	const lang = str(data?.language) || b.siteLanguage;
	if (!data) return { lang, alternates: [] };
	const root = str(data.translation_of) || str(data.title);
	if (!root) return { lang, alternates: [] };
	const pages = await entries("pages", { limit: 500 });
	const group = pages.filter((p) => str(p.data.title) === root || str(p.data.translation_of) === root);
	if (group.length < 2) return { lang, alternates: [] };
	const pagesPattern = (await sitePatterns()).pages ?? "/{slug}";
	const href = (p: Entry) => `${origin}${p.slug === "home" ? "/" : entryPath(pagesPattern, p.slug ?? p.id)}`;
	const alternates = group.map((p) => ({ lang: str(p.data.language) || b.siteLanguage, href: href(p) }));
	const def = group.find((p) => !str(p.data.translation_of));
	if (def) alternates.push({ lang: "x-default", href: href(def) });
	return { lang, alternates };
}

// ---------------------------------------------------------------------------
// Routes: where records render as pages (lib/routes.ts has the pure part)
// ---------------------------------------------------------------------------

/** Reads that every section repeats on a page: cached for a few seconds, so one request costs one read each. */
const shortCache = new Map<string, { at: number; value: Promise<unknown> }>();
function cached<T>(key: string, ttlMs: number, read: () => Promise<T>): Promise<T> {
	const now = Date.now();
	const hit = shortCache.get(key);
	if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
	const value = read().catch((err) => { shortCache.delete(key); throw err; });
	shortCache.set(key, { at: now, value });
	return value;
}
/** Forget the cached patterns and frame, for tests and for a request that just changed them. */
export function forgetRoutes(): void { shortCache.clear(); }

/** The URL pattern of every page-bearing collection as the site has it (EmDash's collection setting; the template's default until changed). */
export function sitePatterns(): Promise<Record<string, string>> {
	return cached("patterns", 5_000, async () => {
		const out: Record<string, string> = {};
		await Promise.all(PAGE_TYPES.map(async (t) => {
			let pattern = t.pattern;
			try { const info = (await getCollectionInfo(t.collection)) as { urlPattern?: string | null } | null; if (info?.urlPattern) pattern = info.urlPattern; } catch { /* the collection is missing on an older site */ }
			out[t.collection] = pattern;
		}));
		return out;
	});
}
/** The frame record's data (listing switches, labels), or an empty record. */
export function siteFrame(): Promise<Record<string, unknown>> {
	return cached("frame", 5_000, async () => (await oneRecord("frame"))?.data ?? {});
}

/** The address of a record's page, or null when the record has no page (its type never does, or its switch is off). */
export async function entryUrl(collection: string, entry: { slug?: string | null; id: string; data?: Record<string, unknown> } | null | undefined): Promise<string | null> {
	const t = pageType(collection);
	if (!t || !entry) return null;
	if (!hasPage(t, entry.data ?? null)) return null;
	const slug = entry.slug ?? entry.id;
	if (collection === "pages") {
		if (slug === "home") return "/";
		const parents = await pageParents(entry.data ?? null);
		return entryPath((await sitePatterns()).pages ?? t.pattern, [...parents.map((x) => x.slug), slug].join("/"));
	}
	return entryPath((await sitePatterns())[collection] ?? t.pattern, slug);
}

/**
 * The pages above a page, top first: a page names its parent by slug
 * (`parent`), and its address is the parent's address plus its own slug.
 * Stops at a missing parent, a loop, or the depth limit.
 */
export async function pageParents(data: Record<string, unknown> | null, lookup?: (slug: string) => Promise<Entry | null>): Promise<Array<{ slug: string; title: string }>> {
	const out: Array<{ slug: string; title: string }> = [];
	const seen = new Set<string>();
	let next = str(data?.parent).trim().replace(/^\/+|\/+$/g, "");
	const find = lookup ?? (async (slug: string) => { try { const r = (await getEmDashEntry("pages" as never, slug)) as { entry?: { id: string; slug?: string; data?: Record<string, unknown> } | null }; return r.entry ? { id: r.entry.id, slug: r.entry.slug ?? slug, data: r.entry.data ?? {} } : null; } catch { return null; } });
	while (next && !seen.has(next) && out.length < MAX_PAGE_DEPTH - 1) {
		seen.add(next);
		const e = await find(next);
		if (!e || next === "home") break;
		out.unshift({ slug: next, title: field(e, "title") || next });
		next = str(e.data.parent).trim().replace(/^\/+|\/+$/g, "");
	}
	return out;
}
/** The address of a type's listing page, or null when the type has none or its switch is off. The blog's is always on. */
export async function collectionUrl(collection: string): Promise<string | null> {
	const t = pageType(collection);
	if (!t) return null;
	const [patterns, frame] = await Promise.all([sitePatterns(), siteFrame()]);
	const base = indexPath(patterns[collection] ?? t.pattern);
	if (!base) return null;
	if (collection === "posts") return base;
	return indexLive(t, frame, await listable(t)) ? base : null;
}
/** The blog's address (the posts pattern's prefix), `/blog` unless the site changed it. */
export async function blogBase(): Promise<string> {
	return (await collectionUrl("posts")) ?? "/blog";
}

/** What a path is on this site: the first candidate whose record exists and has its page on, or null for a 404. */
/** Whether a type has at least one record with its page on, so its listing has something to show. */
async function listable(t: PageType): Promise<boolean> {
	const list = await entries(t.collection, { limit: 50 });
	return list.some((e) => hasPage(t, e.data));
}

export async function resolveRoute(path: string): Promise<(Route & { entry?: Awaited<ReturnType<typeof getEmDashEntry>>["entry"]; cacheHint?: unknown }) | null> {
	const [patterns, frame] = await Promise.all([sitePatterns(), siteFrame()]);
	for (const c of routeCandidates(path, patterns, frame)) {
		if (c.kind === "index") {
			const t = pageType(c.collection);
			if (!t || !indexLive(t, frame, await listable(t))) continue;
			return c;
		}
		if (c.kind === "home" || c.kind === "blog") return c;
		const collection = c.kind === "page" ? "pages" : c.collection;
		let found: { entry: unknown; cacheHint?: unknown } | null = null;
		try { found = (await getEmDashEntry(collection as never, c.slug)) as { entry: unknown; cacheHint?: unknown }; } catch { found = null; }
		const entry = found?.entry as { data?: Record<string, unknown> } | null | undefined;
		if (!entry) continue;
		if (c.kind === "entry" && !hasPage(pageType(collection), entry.data ?? null)) continue;
		if (c.kind === "page") { const chain = (await pageParents(entry.data ?? null)).map((x) => x.slug).join("/"); if (chain !== (c.parents ?? []).join("/")) continue; }
		return { ...c, entry: entry as never, cacheHint: found?.cacheHint };
	}
	return null;
}

export interface SitePage { path: string; kind: "home" | "page" | "index" | "entry" | "blog"; collection?: string; id?: string; slug?: string; title: string; /** The record keeps the page out of search engines: the sitemap leaves it out. */ noindex?: boolean }
/** Every address the site renders: the home page, the pages, each listing that is on, the blog and its facets, and every record whose page is on. For the publish, the sitemap and the pages tool. */
export async function sitePages(): Promise<SitePage[]> {
	const [patterns, frame] = await Promise.all([sitePatterns(), siteFrame()]);
	const out: SitePage[] = [{ path: "/", kind: "home", title: "Home" }];
	const seen = new Set<string>(["/"]);
	const add = (p: SitePage) => { const path = normalizePath(p.path); if (!seen.has(path)) { seen.add(path); out.push({ ...p, path }); } };
	const lists = new Map<string, Entry[]>();
	for (const t of PAGE_TYPES) lists.set(t.collection, await entries(t.collection, { limit: 1000 }));
	for (const t of PAGE_TYPES) {
		const pattern = patterns[t.collection] ?? t.pattern;
		if (t.index && indexLive(t, frame, (lists.get(t.collection) ?? []).some((e) => hasPage(t, e.data)))) { const base = indexPath(pattern); if (base) add({ path: base, kind: "index", collection: t.collection, title: t.index.label }); }
		if (t.collection === "posts") { const base = indexPath(pattern); if (base) add({ path: base, kind: "blog", collection: "posts", title: "Blog" }); }
	}
	for (const t of PAGE_TYPES) {
		const pattern = patterns[t.collection] ?? t.pattern;
		const list = lists.get(t.collection) ?? [];
		const bySlug = new Map(list.map((e) => [e.slug ?? e.id, e] as const));
		for (const e of list) {
			const slug = e.slug ?? e.id;
			if (t.collection === "pages" && slug === "home") { if (bool(e.data.noindex)) out[0]!.noindex = true; continue; }
			if (!hasPage(t, e.data)) continue;
			const chain = t.collection === "pages" ? [...(await pageParents(e.data, async (x) => bySlug.get(x) ?? null)).map((x) => x.slug), slug].join("/") : slug;
			add({ path: entryPath(pattern, chain), kind: t.collection === "pages" ? "page" : "entry", collection: t.collection, id: refId(e), slug, title: field(e, "title"), ...(bool(e.data.noindex) ? { noindex: true } : {}) });
		}
	}
	const base = indexPath(patterns.posts ?? "/blog/{slug}");
	if (base) {
		const f = await blogFacets();
		for (const c of f.categories) add({ path: `${base}/category/${c.slug}`, kind: "blog", collection: "posts", title: c.label });
		for (const tg of f.tags) add({ path: `${base}/tag/${tg.slug}`, kind: "blog", collection: "posts", title: tg.label });
		for (const a of f.authors) add({ path: `${base}/author/${a.slug}`, kind: "blog", collection: "posts", title: a.label });
	}
	return out;
}

/** The field each page-bearing record keeps its own picture in. */
const RECORD_IMAGE: Record<string, string> = { services: "featured_image", service_categories: "featured_image", service_areas: "featured_image", audiences: "featured_image", people: "photo", technologies: "image", products: "image", case_studies: "featured_image", posts: "featured_image" };

export interface PageHeadInput {
	/** The collection the page renders; null for a fixed page (a listing, the blog, contact, 404). */
	collection?: string | null;
	/** The record's data, when there is one. */
	data?: Record<string, unknown> | null;
	/** The page's sections (its FAQ sections give FAQPage; a page's first hero gives its picture). */
	sections?: unknown;
	path: string; origin: string;
	/** The page title the theme shows, and its description and picture when no SEO field says otherwise. */
	title: string; description?: string; image?: string | null;
	/** The breadcrumb trail the theme shows; derived from the collection's listing when left out. */
	crumbs?: Crumb[];
	/** When the record was published and last changed (ISO), for a post's entry. */
	dates?: { published?: string | null; modified?: string | null };
}

/**
 * A page's head, from its record and the site: title tag, description,
 * canonical, robots, the share title, description and image, and the
 * structured data (the business and its locations on every page, the
 * breadcrumbs, the record's own entry, the page's questions). A theme's
 * layout calls it once and hands the result to the page context; see
 * lib/seo for the derivation and the override fields.
 */
export async function pageHead(request: Request, input: PageHeadInput): Promise<PageSeo> {
	const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : str(v));
	const business = await getBusiness(request);
	const data = input.data ?? {};
	const collection = input.collection ?? null;
	const home = input.path === "/";
	const abs = (u: string | null | undefined): string | null => (u ? (/^https?:\/\//i.test(u) ? u : `${input.origin}${u.startsWith("/") ? "" : "/"}${u}`) : null);
	const t = collection ? pageType(collection) : undefined;
	let crumbs = input.crumbs;
	if (!crumbs) {
		crumbs = [{ label: "Home", href: "/" }];
		if (t?.index && collection) crumbs.push({ label: t.index.label, href: await collectionUrl(collection) });
		else if (collection === "posts") crumbs.push({ label: "Blog", href: await blogBase() });
		else if (collection === "pages" && str(data.parent)) {
			const parents = await pageParents(data);
			const pattern = (await sitePatterns()).pages ?? "/{slug}";
			parents.forEach((x, i) => crumbs!.push({ label: x.title, href: entryPath(pattern, parents.slice(0, i + 1).map((y) => y.slug).join("/")) }));
		}
		if (!home) crumbs.push({ label: input.title });
	}
	const sections = list<Record<string, unknown>>(input.sections);
	const faqs: Array<{ question: string; answer: string }> = [];
	for (const b of sections) {
		if (b._type !== "faq") continue;
		const group = str(b.group);
		const items = await entries("faqs", { limit: int(b.limit, 40), ...(group ? { where: { group } } : {}) });
		for (const q of items) faqs.push({ question: str(q.data.title), answer: str(q.data.answer) });
		for (const q of list<Record<string, unknown>>(b.items)) faqs.push({ question: str(q.question), answer: str(q.answer) });
	}
	let author: { name: string; url: string | null } | null = null;
	if (collection === "posts" && data.author) {
		const people = await entries("people", { limit: 200 });
		const raw = typeof data.author === "object" && data.author && "id" in data.author ? str((data.author as { id?: unknown }).id) : str(data.author);
		const p = people.find((x) => x.id === raw || str(x.data.id) === raw || str(x.data.title) === raw);
		if (p) author = { name: str(p.data.display_name) || str(p.data.title), url: await entryUrl("people", p) };
	}
	const locations = await entries("locations", { limit: 50 });
	const identity: Identity = {
		name: business.title, url: input.origin, type: business.schemaType,
		phone: business.phone, email: business.email,
		address: business.address, city: business.city, region: business.region, postal: business.postal, country: business.country, hideAddress: business.hideAddress,
		logo: abs(business.logo?.src), sameAs: business.social.map((x) => x.url), foundedYear: business.foundedYear, priceRange: business.priceRange, hoursLine: business.hours,
		locations: locations.map((l) => ({
			name: field(l, "title"), address: field(l, "address"), city: field(l, "city"), region: field(l, "region"), postal: field(l, "postal"), phone: field(l, "phone"), mapUrl: field(l, "map_url"),
			hours: { mon: field(l, "hours_mon"), tue: field(l, "hours_tue"), wed: field(l, "hours_wed"), thu: field(l, "hours_thu"), fri: field(l, "hours_fri"), sat: field(l, "hours_sat"), sun: field(l, "hours_sun") }
		})),
		override: business.siteSchema
	};
	const hero = sections.find((b) => b._type === "hero");
	const recordImage = abs(collection && RECORD_IMAGE[collection] ? mediaUrl(data[RECORD_IMAGE[collection]!]) : null) ?? (hero ? abs(mediaUrl(hero.image)) : null);
	return pageSeo({
		collection, data, path: input.path, origin: input.origin, siteTitle: business.title,
		fallback: { title: input.title, description: input.description || business.tagline, image: abs(input.image), home },
		identity, crumbs, faqs, author, shareImage: abs(mediaUrl(data.share_image)), recordImage,
		dates: { published: input.dates?.published || iso(data.publishedAt), modified: input.dates?.modified || iso(data.updatedAt) }
	});
}
