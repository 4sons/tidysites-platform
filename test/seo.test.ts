import { describe, expect, it } from "vitest";
import { canonicalUrl, identityGraph, pageSeo, parseHours, parseSchemaOverride, type Identity, type PageSeoInput } from "../src/lib/seo";
import { collections } from "../src/template/index";

const identity: Identity = {
	name: "Harbour Dental", url: "https://harbourdental.ca", type: "Dentist", phone: "(902) 555-0100", email: "hello@harbourdental.ca",
	address: "12 Water St", city: "Halifax", region: "NS", postal: "B3J 1A1", country: "CA", hideAddress: false,
	logo: "https://harbourdental.ca/_emdash/api/media/file/logo.png", sameAs: ["https://facebook.com/harbourdental"], foundedYear: 2004, priceRange: "$$", hoursLine: "",
	locations: [{ name: "Downtown", address: "12 Water St", city: "Halifax", region: "NS", postal: "B3J 1A1", phone: "", mapUrl: "https://maps.google.com/?q=x", hours: { mon: "8:00 am to 5:00 pm", sat: "Closed" } }],
	override: ""
};
const base = (over: Partial<PageSeoInput> = {}): PageSeoInput => ({
	collection: "services", data: { title: "Crowns", summary: "Porcelain crowns." }, path: "/services/crowns", origin: "https://harbourdental.ca", siteTitle: "Harbour Dental",
	fallback: { title: "Crowns", description: "Porcelain crowns." }, identity, crumbs: [{ label: "Home", href: "/" }, { label: "Services", href: "/services" }, { label: "Crowns" }],
	recordImage: "https://harbourdental.ca/_emdash/api/media/file/crown.jpg", ...over
});

describe("the template's SEO fields", () => {
	it("puts the same group on every collection with a URL pattern, and only there", () => {
		const group = ["meta_title", "meta_description", "share_image", "social_title", "social_description", "canonical", "noindex", "schema"];
		for (const c of collections) {
			const has = group.filter((g) => c.fields.some((f) => f.slug === g));
			if (c.urlPattern) expect(has, c.slug).toEqual(group);
			else expect(has, c.slug).toEqual([]);
		}
		const biz = collections.find((c) => c.slug === "business")!;
		expect(biz.fields.map((f) => f.slug)).toEqual(expect.arrayContaining(["schema_type", "price_range"]));
		expect(collections.find((c) => c.slug === "frame")!.fields.some((f) => f.slug === "site_schema")).toBe(true);
	});
});

describe("pageSeo", () => {
	it("derives everything from the record when no field is set", () => {
		const s = pageSeo(base());
		expect(s.title).toBe("Crowns · Harbour Dental");
		expect(s.description).toBe("Porcelain crowns.");
		expect(s.canonical).toBe("https://harbourdental.ca/services/crowns");
		expect(s.robots).toBeNull();
		expect(s.og).toEqual({ title: "Crowns", description: "Porcelain crowns.", image: "https://harbourdental.ca/_emdash/api/media/file/crown.jpg" });
		const types = s.jsonld.map((n) => n["@type"]);
		expect(types).toEqual(["Dentist", "BreadcrumbList", "Service"]);
		const service = s.jsonld[2]!;
		expect(service.provider).toEqual({ "@id": "https://harbourdental.ca/#business" });
		expect(s.jsonLdHtml).toContain('<script type="application/ld+json">');
	});
	it("uses a set field instead of the derived value, field by field", () => {
		const s = pageSeo(base({ data: { title: "Crowns", summary: "Porcelain crowns.", meta_title: "Dental Crowns in Halifax | Harbour Dental", social_title: "Crowns that last", canonical: "/services/dental-crowns", noindex: true }, shareImage: "https://harbourdental.ca/_emdash/api/media/file/share.jpg" }));
		expect(s.title).toBe("Dental Crowns in Halifax | Harbour Dental");
		expect(s.og.title).toBe("Crowns that last");
		expect(s.og.image).toBe("https://harbourdental.ca/_emdash/api/media/file/share.jpg");
		expect(s.canonical).toBe("https://harbourdental.ca/services/dental-crowns");
		expect(s.robots).toBe("noindex, follow");
		expect(s.noindex).toBe(true);
	});
	it("falls back for the share image: the record's picture, then the page's, then the logo", () => {
		expect(pageSeo(base({ recordImage: null, fallback: { title: "Crowns", image: "https://x/hero.jpg" } })).og.image).toBe("https://x/hero.jpg");
		expect(pageSeo(base({ recordImage: null })).og.image).toBe(identity.logo);
	});
	it("keeps the business entry and replaces the page's own entries with the written structured data", () => {
		const s = pageSeo(base({ data: { title: "Crowns", schema: '{"@context":"https://schema.org","@type":"MedicalProcedure","name":"Crown"}' } }));
		expect(s.jsonld.map((n) => n["@type"])).toEqual(["Dentist", "MedicalProcedure"]);
		const bad = pageSeo(base({ data: { title: "Crowns", schema: "{not json" } }));
		expect(bad.jsonld.map((n) => n["@type"])).toEqual(["Dentist", "BreadcrumbList", "Service"]);
	});
	it("writes FAQPage from the page's questions and BlogPosting with the author and dates for a post", () => {
		const faq = pageSeo(base({ collection: "pages", data: { title: "About" }, faqs: [{ question: "Do you take new patients?", answer: "Yes." }, { question: "", answer: "x" }] }));
		expect(faq.jsonld.map((n) => n["@type"])).toEqual(["Dentist", "BreadcrumbList", "FAQPage"]);
		expect((faq.jsonld[2]!.mainEntity as unknown[]).length).toBe(1);
		const post = pageSeo(base({ collection: "posts", data: { title: "Flossing", summary: "Why." }, author: { name: "Dr. Lee", url: "/team/lee" }, dates: { published: "2026-01-02T00:00:00Z" }, crumbs: [] }));
		const node = post.jsonld.find((n) => n["@type"] === "BlogPosting")!;
		expect(node.author).toEqual({ "@type": "Person", name: "Dr. Lee", url: "/team/lee" });
		expect(node.datePublished).toBe("2026-01-02T00:00:00Z");
		expect(node.dateModified).toBe("2026-01-02T00:00:00Z");
		expect(post.jsonld.some((n) => n["@type"] === "BreadcrumbList")).toBe(false);
	});
	it("titles the home page with the site and its tagline", () => {
		const s = pageSeo(base({ collection: "pages", data: {}, path: "/", fallback: { title: "Harbour Dental", description: "Gentle dentistry downtown.", home: true } }));
		expect(s.title).toBe("Harbour Dental · Gentle dentistry downtown.");
	});
});

describe("identityGraph", () => {
	it("writes the business with its address, hours, socials and map, and a second entry per other location", () => {
		const [main, second] = identityGraph({ ...identity, locations: [...identity.locations, { name: "Bedford", address: "5 Mill Rd", city: "Bedford", region: "NS", postal: "B4A 1A1", phone: "(902) 555-0200", mapUrl: "", hours: { mon: "9-5" } }] });
		expect(main!["@type"]).toBe("Dentist");
		expect(main!.address).toEqual({ "@type": "PostalAddress", streetAddress: "12 Water St", addressLocality: "Halifax", addressRegion: "NS", postalCode: "B3J 1A1", addressCountry: "CA" });
		expect(main!.openingHoursSpecification).toEqual([{ "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "08:00", closes: "17:00" }]);
		expect(main!.hasMap).toBe("https://maps.google.com/?q=x");
		expect(main!.foundingDate).toBe("2004");
		expect(second!["@id"]).toBe("https://harbourdental.ca/#location-bedford");
		expect(second!.parentOrganization).toEqual({ "@id": "https://harbourdental.ca/#business" });
		expect(second!.openingHoursSpecification).toEqual([{ "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "09:00", closes: "17:00" }]);
	});
	it("keeps the street address off a service-area business and takes the written entry whole", () => {
		const [main] = identityGraph({ ...identity, hideAddress: true, type: "" });
		expect(main!["@type"]).toBe("LocalBusiness");
		expect(main!.address).toBeUndefined();
		expect(main!.areaServed).toEqual({ "@type": "City", name: "Halifax" });
		expect(identityGraph({ ...identity, override: '{"@type":"Organization","name":"X"}' })).toEqual([{ "@type": "Organization", name: "X" }]);
	});
});

describe("parseHours", () => {
	it("reads the ways people write a day's hours", () => {
		expect(parseHours("8:00 am to 5:00 pm")).toEqual({ opens: "08:00", closes: "17:00" });
		expect(parseHours("8am-5pm")).toEqual({ opens: "08:00", closes: "17:00" });
		expect(parseHours("08:30 – 17:00")).toEqual({ opens: "08:30", closes: "17:00" });
		expect(parseHours("8 to 5")).toEqual({ opens: "08:00", closes: "17:00" });
		expect(parseHours("10 to 2pm")).toEqual({ opens: "10:00", closes: "14:00" });
		expect(parseHours("7:30am to 12")).toEqual({ opens: "07:30", closes: "12:00" });
		expect(parseHours("12pm to 8pm")).toEqual({ opens: "12:00", closes: "20:00" });
		expect(parseHours("Closed")).toBeNull();
		expect(parseHours("By appointment")).toBeNull();
		expect(parseHours("")).toBeNull();
	});
});

describe("canonicalUrl and parseSchemaOverride", () => {
	it("takes a path or an address, and falls back to the page's own", () => {
		expect(canonicalUrl("", "https://a.com", "/x/")).toBe("https://a.com/x");
		expect(canonicalUrl("/y", "https://a.com", "/x")).toBe("https://a.com/y");
		expect(canonicalUrl("https://b.com/z", "https://a.com", "/x")).toBe("https://b.com/z");
		expect(canonicalUrl("not a url", "https://a.com", "/")).toBe("https://a.com/");
	});
	it("accepts one object or a list, nothing else", () => {
		expect(parseSchemaOverride('[{"a":1},5,"x"]')).toEqual([{ a: 1 }]);
		expect(parseSchemaOverride("42")).toBeNull();
		expect(parseSchemaOverride("   ")).toBeNull();
	});
});
