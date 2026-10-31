import { describe, expect, it } from "vitest";
import { brandStyle, brandTokens, fontLinks, googleFontHrefs, type Business } from "../src/sections/lib";

const base = {
	brandPrimary: "#1e5a46", brandAccent: "#e8b23a", fontDisplay: "Gabarito", fontBody: "Instrument Sans",
	brandGround: "", brandSurface: "", brandInk: "", brandRadius: "", brandDensity: "", brandTypeScale: "", brandWidth: "",
} as unknown as Business;

describe("brand tokens", () => {
	it("always sets the colour and font tokens, and leaves the rest to the theme when the record is silent", () => {
		const t = brandTokens(base);
		expect(t).toEqual({ "--brand-primary": "#1e5a46", "--brand-primary-ink": "#ffffff", "--brand-accent": "#e8b23a", "--brand-accent-ink": "#111111", "--brand-font-display": '"Gabarito", Arial, sans-serif', "--brand-font-body": '"Instrument Sans", "Helvetica Neue", Arial, sans-serif' });
	});
	it("sets radius, spacing, type and width when the record chooses them", () => {
		const t = brandTokens({ ...base, brandRadius: "soft", brandDensity: "regular", brandTypeScale: "regular", brandWidth: "regular" });
		expect(t).toMatchObject({ "--brand-radius": "10px", "--brand-type": "1", "--brand-max": "1180px" });
		expect(t["--brand-space"]).toMatch(/^clamp/);
	});
	it("sets surface and ink tokens only when the record has them, deriving the secondary inks and the line", () => {
		const t = brandTokens({ ...base, brandGround: "#fffdf7", brandSurface: "#ffffff", brandInk: "#1b1f3a", brandRadius: "pill", brandDensity: "airy", brandTypeScale: "large", brandWidth: "wide" });
		expect(t).toMatchObject({ "--brand-ground": "#fffdf7", "--brand-surface": "#ffffff", "--brand-ink": "#1b1f3a", "--brand-radius": "28px", "--brand-type": "1.08", "--brand-max": "1320px" });
		expect(t["--brand-ink-2"]).toBe("color-mix(in srgb, #1b1f3a 74%, #fffdf7)");
		expect(t["--brand-line"]).toBe("color-mix(in srgb, #1b1f3a 16%, #fffdf7)");
	});
	it("renders as one inline style", () => {
		expect(brandStyle(base)).toMatch(/^--brand-primary:#1e5a46;--brand-primary-ink:#ffffff;/);
	});
});

describe("font stylesheets", () => {
	it("asks Google for one stylesheet per family, light to extra bold, so a family Google lacks fails alone", () => {
		const links = googleFontHrefs({ ...base, displayFontFile: "", bodyFontFile: "", adobeFontsKit: "" } as Business);
		expect(links).toEqual([
			"https://fonts.googleapis.com/css2?family=Gabarito:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,700&display=swap",
			"https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,700&display=swap"
		]);
		expect(fontLinks({ ...base, displayFontFile: "", bodyFontFile: "", adobeFontsKit: "" } as Business)).toEqual(links);
	});
	it("requests a family once when both tokens name it, and not at all when an uploaded file stands in for it", () => {
		expect(googleFontHrefs({ ...base, fontBody: "gabarito", displayFontFile: "", bodyFontFile: "", adobeFontsKit: "" } as Business)).toHaveLength(1);
		expect(googleFontHrefs({ ...base, displayFontFile: "https://x/d.woff2", bodyFontFile: "", adobeFontsKit: "" } as Business)).toEqual(["https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,700&display=swap"]);
	});
});
