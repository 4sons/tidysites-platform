/**
 * GET /_tidy/strings: every fixed label the site prints that a person can
 * reword, with the site's own words where the frame record's `wording` lines
 * set them: the package's catalog (lib/strings) plus the theme's own, handed
 * to `tidyPlatform({ strings })` in astro.config. The platform's search lists
 * these beside the records, and a replace writes the wording line.
 */
import { getBusiness } from "../sections/lib";
import { PACKAGE_STRINGS } from "../lib/strings";
import { json } from "../lib/http";
import { methodNotAllowed, platformRoute } from "./_shared";

declare const __TIDY_THEME_STRINGS__: string[] | undefined;

export const prerender = false;

export const GET = platformRoute(async (context) => {
	const business = await getBusiness(context.request);
	const theme = typeof __TIDY_THEME_STRINGS__ !== "undefined" && Array.isArray(__TIDY_THEME_STRINGS__) ? __TIDY_THEME_STRINGS__ : [];
	const seen = new Set<string>();
	const strings: Array<{ text: string; override: string | null; source: "package" | "theme" }> = [];
	for (const [source, list] of [["package", PACKAGE_STRINGS], ["theme", theme]] as const) {
		for (const text of list) {
			if (!text || seen.has(text)) continue;
			seen.add(text);
			strings.push({ text, override: business.wording[text] ?? null, source });
		}
	}
	// Lines that name a label no catalog knows still apply when a theme prints it; they are listed so a search can find them.
	for (const [text, override] of Object.entries(business.wording)) if (!seen.has(text)) strings.push({ text, override, source: "theme" });
	return json({ ok: true, strings, count: strings.length });
});

export const ALL = methodNotAllowed("GET");
