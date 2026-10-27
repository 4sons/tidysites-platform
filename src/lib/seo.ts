/**
 * A page's SEO, from the record that renders it: the title tag, the meta
 * description, the canonical, the robots line, the share (Open Graph) title,
 * description and image, and the structured data. Every field is empty by
 * default and empty means derived: the title from the record's title, the
 * description from its summary, the share image from its own picture, the
 * structured data from the record's type. A set field replaces the derived
 * value. Pure: the runtime side (`pageHead` in sections/lib) reads the
 * records and calls this.
 */

export interface Crumb { label: string; href?: string | null }

/** What the business record says about itself, as the structured data reads it. */
export interface Identity {
	name: string; url: string;
	/** A schema.org type (Dentist, Plumber, RoofingContractor...); LocalBusiness when empty. */
	type: string;
	phone: string; email: string;
	address: string; city: string; region: string; postal: string; country: string;
	/** The street address stays off the site (a service-area business). */
	hideAddress: boolean;
	logo: string | null;
	sameAs: string[];
	foundedYear: number | null;
	priceRange: string;
	/** The business record's one-line hours ("Mon to Fri 8am to 5pm"); read only when no location has day-by-day hours. */
	hoursLine: string;
	locations: IdentityLocation[];
	/** The frame record's own JSON-LD for the business, replacing the generated entry when set. */
	override: string;
}
export interface IdentityLocation {
	name: string; address: string; city: string; region: string; postal: string; phone: string; mapUrl: string;
	/** Per-day lines as written ("8:00 am to 5:00 pm", "Closed"); keys mon..sun. */
	hours: Partial<Record<Day, string>>;
}
export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface PageSeoInput {
	/** The collection the page renders, null for a fixed page (the blog listing, contact, 404). */
	collection: string | null;
	/** The record's data, {} when there is none. */
	data: Record<string, unknown>;
	/** The address being rendered and the site's origin. */
	path: string; origin: string;
	siteTitle: string;
	/** What the theme would show without any SEO field set: the page's title, its description, its own picture (absolute URL). */
	fallback: { title: string; description?: string; image?: string | null; home?: boolean };
	identity: Identity;
	crumbs?: Crumb[];
	/** Questions on the page (its FAQ sections), for FAQPage. */
	faqs?: Array<{ question: string; answer: string }>;
	/** A post's author, resolved by the caller. */
	author?: { name: string; url?: string | null } | null;
	/** The record's share image field, resolved to an absolute URL by the caller. */
	shareImage?: string | null;
	/** The record's own picture (absolute URL), for the share image and the structured data. */
	recordImage?: string | null;
	/** When the record was published and last changed (ISO), for posts. */
	dates?: { published?: string | null; modified?: string | null };
}

export interface PageSeo {
	/** The document title, as the title tag prints it. */
	title: string;
	description: string;
	canonical: string;
	/** "noindex, follow" when the record keeps the page out of search engines, else null. */
	robots: string | null;
	noindex: boolean;
	og: { title: string; description: string; image: string | null };
	jsonld: Array<Record<string, unknown>>;
	/** The structured data as script tags, for the head. */
	jsonLdHtml: string;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const bool = (v: unknown): boolean => v === true || v === 1 || v === "on" || v === "true";
const clean = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))) as T;

/** Serialize for a script tag: nothing in the JSON can close the tag or open a comment. */
export function jsonLdScript(graph: Record<string, unknown>): string {
	const json = JSON.stringify(graph).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
	return `<script type="application/ld+json">${json}</script>`;
}

/** A written JSON-LD override: one object or a list of them; anything else (empty, invalid, a scalar) is nothing. */
export function parseSchemaOverride(text: unknown): Array<Record<string, unknown>> | null {
	const s = str(text);
	if (!s) return null;
	try {
		const v = JSON.parse(s) as unknown;
		if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Array<Record<string, unknown>>;
		if (v && typeof v === "object") return [v as Record<string, unknown>];
		return null;
	} catch {
		return null;
	}
}

/** An absolute URL for a canonical field: a path on the site, or an http(s) address as written; anything else falls back. */
export function canonicalUrl(value: unknown, origin: string, path: string): string {
	const own = `${origin}${path === "/" ? "/" : path.replace(/\/+$/, "")}`;
	const v = str(value);
	if (!v) return own;
	if (v.startsWith("/")) return `${origin}${v}`;
	if (/^https?:\/\//i.test(v)) return v;
	return own;
}

const DAYS: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_NAMES: Record<Day, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

/** "8:00 am to 5:30 pm", "8am-5pm", "08:30 – 17:00", "8 to 5" into 24-hour opens/closes; null for "Closed", "By appointment" or anything unreadable. */
export function parseHours(line: string): { opens: string; closes: string } | null {
	const s = line.trim().toLowerCase().replace(/\./g, "");
	if (!s || /closed|appointment|call/.test(s)) return null;
	const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-|–|—|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(s);
	if (!m) return null;
	let h1 = Number(m[1]), h2 = Number(m[4]);
	const m1 = m[2] ?? "00", m2 = m[5] ?? "00";
	let a1 = m[3] as "am" | "pm" | undefined, a2 = m[6] as "am" | "pm" | undefined;
	if (h1 > 24 || h2 > 24 || Number(m1) > 59 || Number(m2) > 59) return null;
	if (!a1 && !a2) {
		// No am/pm at all: a 24-hour pair as written, or "8 to 5" where the close is in the afternoon.
		if (h2 < h1) h2 += 12;
	} else {
		if (!a2) a2 = a1 === "am" && (h2 < h1 || h2 === 12) ? "pm" : a1;
		if (!a1) a1 = a2 === "pm" && h1 > h2 ? "am" : a2;
		const to24 = (h: number, a: "am" | "pm" | undefined) => (a === "pm" && h < 12 ? h + 12 : a === "am" && h === 12 ? 0 : h);
		h1 = to24(h1, a1); h2 = to24(h2, a2);
	}
	if (h1 >= 24 || h2 > 24) return null;
	const f = (h: number, mm: string) => `${String(h).padStart(2, "0")}:${mm}`;
	return { opens: f(h1, m1), closes: f(h2, m2) };
}

function openingHours(hours: Partial<Record<Day, string>>): Array<Record<string, unknown>> {
	const out: Array<Record<string, unknown>> = [];
	for (const d of DAYS) {
		const line = str(hours[d]); if (!line) continue;
		const t = parseHours(line); if (!t) continue;
		out.push({ "@type": "OpeningHoursSpecification", dayOfWeek: DAY_NAMES[d], opens: t.opens, closes: t.closes });
	}
	return out;
}

function postalAddress(a: { address: string; city: string; region: string; postal: string; country?: string }): Record<string, unknown> | undefined {
	const node = clean({ "@type": "PostalAddress", streetAddress: a.address, addressLocality: a.city, addressRegion: a.region, postalCode: a.postal, addressCountry: a.country || undefined });
	return Object.keys(node).length > 1 ? node : undefined;
}

/** The business and its locations as structured data: one entry for the business, one more per location at another address. */
export function identityGraph(id: Identity): Array<Record<string, unknown>> {
	const override = parseSchemaOverride(id.override);
	if (override) return override;
	const type = id.type || "LocalBusiness";
	const businessId = `${id.url}/#business`;
	const primary = id.locations.find((l) => l.address && l.address === id.address) ?? id.locations[0] ?? null;
	const hours = primary ? openingHours(primary.hours) : [];
	const main = clean({
		"@context": "https://schema.org", "@type": type, "@id": businessId,
		name: id.name, url: id.url, telephone: id.phone, email: id.email,
		logo: id.logo, image: id.logo,
		address: id.hideAddress ? undefined : postalAddress(id),
		areaServed: id.hideAddress && id.city ? clean({ "@type": "City", name: id.city }) : undefined,
		sameAs: id.sameAs,
		foundingDate: id.foundedYear ? String(id.foundedYear) : undefined,
		priceRange: id.priceRange,
		openingHoursSpecification: hours,
		hasMap: primary?.mapUrl
	});
	const others = id.locations.filter((l) => l !== primary && l.address && !(l.address === id.address && l.postal === id.postal)).map((l) => clean({
		"@context": "https://schema.org", "@type": type, "@id": `${id.url}/#location-${l.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`,
		name: l.name ? `${id.name} ${l.name}` : id.name, parentOrganization: { "@id": businessId },
		telephone: l.phone || id.phone, address: id.hideAddress ? undefined : postalAddress(l), openingHoursSpecification: openingHours(l.hours), hasMap: l.mapUrl
	}));
	return [main, ...others];
}

function breadcrumbGraph(crumbs: Crumb[], origin: string): Record<string, unknown> | null {
	if (crumbs.length < 2) return null;
	return {
		"@context": "https://schema.org", "@type": "BreadcrumbList",
		itemListElement: crumbs.map((c, i) => clean({ "@type": "ListItem", position: i + 1, name: c.label, item: c.href ? (c.href.startsWith("http") ? c.href : `${origin}${c.href}`) : undefined }))
	};
}

/** The record's own entry: a Service, a Person, a BlogPosting, a Product; nothing for the types with no fitting entry. */
export function recordGraph(input: PageSeoInput, title: string, description: string, image: string | null, canonical: string): Record<string, unknown> | null {
	const d = input.data; const businessId = `${input.identity.url}/#business`;
	switch (input.collection) {
		case "services":
			return clean({ "@context": "https://schema.org", "@type": "Service", name: str(d.title) || title, description, url: canonical, image, provider: { "@id": businessId }, serviceType: str(d.title) || undefined });
		case "people":
			return clean({ "@context": "https://schema.org", "@type": "Person", name: str(d.display_name) || str(d.title) || title, jobTitle: str(d.role), description: str(d.bio) || description, image, url: canonical, worksFor: { "@id": businessId }, sameAs: str(d.social_url) ? [str(d.social_url)] : [] });
		case "posts":
			return clean({
				"@context": "https://schema.org", "@type": "BlogPosting", headline: str(d.title) || title, description, image, url: canonical, mainEntityOfPage: canonical,
				datePublished: input.dates?.published || undefined, dateModified: input.dates?.modified || input.dates?.published || undefined,
				author: input.author ? clean({ "@type": "Person", name: input.author.name, url: input.author.url || undefined }) : { "@id": businessId },
				publisher: { "@id": businessId }
			});
		case "products":
			return clean({ "@context": "https://schema.org", "@type": "Product", name: str(d.title) || title, description, image, url: canonical, brand: str(d.brand) ? { "@type": "Brand", name: str(d.brand) } : undefined, sku: str(d.sku) || undefined });
		default:
			return null;
	}
}

function faqGraph(faqs: Array<{ question: string; answer: string }>): Record<string, unknown> | null {
	const items = faqs.filter((f) => str(f.question) && str(f.answer));
	if (!items.length) return null;
	return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((f) => ({ "@type": "Question", name: str(f.question), acceptedAnswer: { "@type": "Answer", text: str(f.answer) } })) };
}

/** The page's SEO from its record and the site. */
export function pageSeo(input: PageSeoInput): PageSeo {
	const d = input.data;
	const pageTitle = input.fallback.title;
	const derivedTitle = input.fallback.home ? [input.siteTitle, input.fallback.description].filter(Boolean).join(" · ") : pageTitle && pageTitle !== input.siteTitle ? `${pageTitle} · ${input.siteTitle}` : input.siteTitle;
	const title = str(d.meta_title) || derivedTitle;
	const description = str(d.meta_description) || str(input.fallback.description);
	const canonical = canonicalUrl(d.canonical, input.origin, input.path);
	const noindex = bool(d.noindex);
	const image = input.shareImage || input.recordImage || input.fallback.image || input.identity.logo || null;
	const og = { title: str(d.social_title) || str(d.meta_title) || pageTitle || input.siteTitle, description: str(d.social_description) || description, image };

	const override = parseSchemaOverride(d.schema);
	const pageNodes: Array<Record<string, unknown>> = override ?? [
		breadcrumbGraph(input.crumbs ?? [], input.origin),
		recordGraph(input, pageTitle, description, image, canonical),
		faqGraph(input.faqs ?? [])
	].filter((n): n is Record<string, unknown> => Boolean(n));
	const jsonld = [...identityGraph(input.identity), ...pageNodes];
	return { title, description, canonical, robots: noindex ? "noindex, follow" : null, noindex, og, jsonld, jsonLdHtml: jsonld.map(jsonLdScript).join("\n") };
}
