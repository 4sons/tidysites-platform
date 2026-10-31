/**
 * A theme's own stylesheet names classes for its pages (.hero, .card, .wrap,
 * .sr). A custom row is markup someone else wrote, and a class it happens to
 * share with the theme would take the theme's rule (a row's `.sr` vanished
 * into a screen-reader clip). The theme's class rules are kept out of rows:
 * every selector that names a class of the theme's own gets
 * `:where(:not(.ts-row *))`, which changes nothing about its specificity.
 * Rules on bare elements (p, h2, img) and on the package's own classes
 * (`ts-*`, `tidy-*`) still reach into rows, so a row inherits the page's type
 * and the drop-ins (`ts-btn`, `ts-menu`) look the same everywhere.
 */
const GUARD = ":where(:not(.ts-row *))";
const PSEUDO_ELEMENT = /::[a-z-]+(\([^)]*\))?|:(before|after|first-letter|first-line|marker|placeholder|selection)\b/i;

/** Whether a selector names a class the theme owns (anything but ts-*, tidy-* and emdash-*). */
export function ownsClass(selector: string): boolean {
	const stripped = selector.replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
	for (const m of stripped.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
		if (!/^(ts|ts-.*|tidy-.*|emdash-.*|astro-.*)$/.test(m[1]!)) return true;
	}
	return false;
}

/** The selector with the guard before its pseudo-element (or at its end). */
export function guardSelector(selector: string): string {
	const t = selector.trim();
	if (!t || !ownsClass(t)) return t;
	const m = PSEUDO_ELEMENT.exec(t);
	return m ? `${t.slice(0, m.index)}${GUARD}${t.slice(m.index)}` : `${t}${GUARD}`;
}

/** Split a selector list on the commas outside parentheses and brackets. */
function splitSelectors(head: string): string[] {
	const out: string[] = []; let depth = 0; let cur = "";
	for (const ch of head) {
		if (ch === "(" || ch === "[") depth++;
		else if (ch === ")" || ch === "]") depth--;
		if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
		cur += ch;
	}
	if (cur.trim()) out.push(cur);
	return out;
}

function matchBrace(css: string, open: number): number {
	let depth = 0;
	for (let j = open; j < css.length; j++) { if (css[j] === "{") depth++; else if (css[j] === "}") { depth--; if (depth === 0) return j; } }
	return css.length;
}

/** The stylesheet with the theme's class rules kept out of custom rows. */
export function keepOutOfRows(css: string): string {
	let out = ""; let i = 0;
	while (i < css.length) {
		const open = css.indexOf("{", i);
		if (open < 0) { out += css.slice(i); break; }
		const close = matchBrace(css, open);
		const head = css.slice(i, open);
		const body = css.slice(open + 1, close);
		const lead = head.match(/^\s*/)![0];
		const sel = head.trim();
		if (sel.startsWith("@")) {
			// Conditional groups are walked; keyframes, font faces and the rest are kept as written.
			out += /^@(media|supports|container|layer|scope)\b/i.test(sel) ? `${lead}${sel}{${keepOutOfRows(body)}}` : `${lead}${sel}{${body}}`;
		} else if (sel) {
			out += `${lead}${splitSelectors(sel).map(guardSelector).join(",")}{${body}}`;
		} else out += `${head}{${body}}`;
		i = close + 1;
	}
	return out;
}

/** A Vite plugin for the theme's stylesheets (`src/styles/*.css`): the transform above at build time. */
export function themeCssPlugin(): { name: string; enforce: "pre"; transform(code: string, id: string): { code: string; map: null } | null } {
	return {
		name: "tidysites:theme-css",
		enforce: "pre",
		transform(code: string, id: string) {
			if (id.includes("node_modules") || !/[\\/]src[\\/]styles[\\/][^\\/?]+\.css(\?|$)/.test(id)) return null;
			return { code: keepOutOfRows(code), map: null };
		}
	};
}
