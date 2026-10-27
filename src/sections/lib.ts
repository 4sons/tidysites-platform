/** Helpers every section component shares: reading a stored block, images, lists, and the business record. */
import { getEmDashCollection, getSiteSettings } from "emdash";

export type Node = Record<string, unknown>;

/** A section component receives the stored block as `value`; a Portable Text renderer passes `node`; accept both or the props themselves. */
export function nodeOf(props: Record<string, unknown>): Node {
	return (props.value as Node | undefined) ?? (props.node as Node | undefined) ?? props;
}
export const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
export const bool = (v: unknown, fallback = false): boolean => (typeof v === "boolean" ? v : typeof v === "number" ? v !== 0 : fallback);
export const int = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : fallback);
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
export const lines = (v: unknown): string[] => str(v).split("\n").map((s) => s.trim()).filter(Boolean);
export const list = <T = Record<string, unknown>>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
export const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

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
	/** Third parties by id (or the pasted embed the id is read from): see lib/providers. */
	chatProvider: string; chatId: string; reviewsWidget: string; reviewsWidgetId: string; bookingEmbed: string; bookingEmbedId: string; metaPixelId: string; googleAdsId: string;
	instagramWidget: string; instagramWidgetId: string; accessibilityWidget: string; accessibilityWidgetId: string;
	/** The pop-up the frame opens on its own: what, when, how often. */
	/** A custom row that stands in for the site's header or footer everywhere; a page may say otherwise. */
	headerRow: string; footerRow: string;
	popupShows: "nothing" | "an offer" | "a form"; popupTitle: string; popupOffer: string; popupForm: string; popupTrigger: "on arrival" | "after ten seconds" | "after thirty seconds" | "after scrolling halfway" | "on leaving"; popupEvery: "once a visit" | "once a day" | "every time";
	logo: { src: string; alt?: string; width?: number; height?: number } | null;
	ga4Id: string; gtmId: string; customCss: string;
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
		chatProvider: str(ig.chat_provider), chatId: str(ig.chat_id), reviewsWidget: str(ig.reviews_widget), reviewsWidgetId: str(ig.reviews_widget_id), bookingEmbed: str(ig.booking_embed), bookingEmbedId: str(ig.booking_embed_id), metaPixelId: str(ig.meta_pixel_id), googleAdsId: str(ig.google_ads_id),
		instagramWidget: str(ig.instagram_widget), instagramWidgetId: str(ig.instagram_widget_id), accessibilityWidget: str(ig.accessibility_widget), accessibilityWidgetId: str(ig.accessibility_widget_id),
		headerRow: str(fr.header_row), footerRow: str(fr.footer_row),
		popupShows: pickOne(fr.popup_shows, ["nothing", "an offer", "a form"], "nothing"), popupTitle: str(fr.popup_title), popupOffer: str(fr.popup_offer), popupForm: str(fr.popup_form), popupTrigger: pickOne(fr.popup_trigger, ["on arrival", "after ten seconds", "after thirty seconds", "after scrolling halfway", "on leaving"], "after ten seconds"), popupEvery: pickOne(fr.popup_every, ["once a visit", "once a day", "every time"], "once a visit"),
		logo: mediaSrc(d.logo), ga4Id: s("ga4_id"), gtmId: s("gtm_id"), customCss: s("custom_css"), raw: d,
	};
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
		"--brand-font-display": font(b.fontDisplay, "Arial, sans-serif"), "--brand-font-body": font(b.fontBody, '"Helvetica Neue", Arial, sans-serif'),
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
