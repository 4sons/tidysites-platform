/**
 * A custom row is markup a person or an agent wrote, rendered as part of the
 * page. Nothing in it may run: script, event handlers, javascript: links,
 * styles in the markup and frames to anywhere but a few known hosts are
 * dropped, and the row's CSS is scoped to the row and stripped of imports and
 * expressions. The allowlist is the whole contract; a tag not on it is gone
 * with its attributes, its children kept.
 */
const TAGS = new Set(["a","abbr","address","article","aside","b","blockquote","br","button","caption","cite","code","col","colgroup","dd","del","details","dfn","div","dl","dt","em","figcaption","figure","footer","form","h1","h2","h3","h4","h5","h6","header","hr","i","iframe","img","input","ins","kbd","label","li","main","mark","nav","ol","option","p","picture","pre","q","s","section","select","small","source","span","strong","sub","summary","sup","table","tbody","td","textarea","tfoot","th","thead","time","tr","u","ul","video","audio","svg","path","g","circle","rect","line","polyline","polygon","use","defs","title","desc"]);
const DROP_WITH_CONTENT = new Set(["script","style","noscript","object","embed","applet","template","head","link","meta","base"]);
const GLOBAL_ATTRS = new Set(["class","id","title","lang","dir","role","hidden","tabindex","style","aria-label","aria-labelledby","aria-describedby","aria-hidden","aria-expanded","aria-controls","aria-current","aria-live","data-tidy-dialog","data-tidy-dialog-close"]);
const TAG_ATTRS: Record<string, string[]> = {
	a: ["href","target","rel","download"], img: ["src","srcset","sizes","alt","width","height","loading","decoding"], source: ["src","srcset","sizes","type","media"],
	video: ["src","poster","controls","autoplay","muted","loop","playsinline","width","height"], audio: ["src","controls","autoplay","muted","loop"],
	iframe: ["src","width","height","allow","allowfullscreen","loading","title","referrerpolicy"], form: ["action","method","name"], input: ["type","name","value","placeholder","required","checked","disabled","min","max","step","pattern","autocomplete","inputmode"],
	textarea: ["name","placeholder","required","rows","disabled"], select: ["name","required","disabled","multiple"], option: ["value","selected","disabled"], button: ["type","name","value","disabled"], label: ["for"],
	td: ["colspan","rowspan"], th: ["colspan","rowspan","scope"], col: ["span"], colgroup: ["span"], time: ["datetime"], details: ["open"], ol: ["start","reversed","type"], li: ["value"], q: ["cite"], blockquote: ["cite"], del: ["datetime"], ins: ["datetime"],
	svg: ["viewbox","width","height","fill","stroke","stroke-width","xmlns","preserveaspectratio"], path: ["d","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","fill-rule","clip-rule","opacity"], g: ["fill","stroke","transform","opacity"], circle: ["cx","cy","r","fill","stroke","stroke-width"], rect: ["x","y","width","height","rx","ry","fill","stroke"], line: ["x1","y1","x2","y2","stroke","stroke-width"], polyline: ["points","fill","stroke","stroke-width"], polygon: ["points","fill","stroke"], use: ["href"], picture: [],
};
/** Frames may only show these hosts. */
const FRAME_HOSTS = [/(^|\.)youtube(-nocookie)?\.com$/, /(^|\.)youtu\.be$/, /(^|\.)vimeo\.com$/, /(^|\.)google\.com$/, /(^|\.)calendly\.com$/, /(^|\.)openstreetmap\.org$/];
const URL_ATTRS = new Set(["href","src","action","cite","poster"]);

function safeUrl(value: string, attr: string, tag: string): string | null {
	const v = value.trim();
	if (!v) return null;
	if (/^(#|\/(?!\/)|\.\/|\.\.\/)/.test(v)) return v;
	if (/^(mailto|tel|sms):/i.test(v)) return v;
	if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(v) && (attr === "src" || attr === "poster")) return tag === "img" || tag === "source" ? v : null;
	if (!/^https?:\/\//i.test(v)) return null;
	if (tag === "iframe" && attr === "src") {
		try { const host = new URL(v).hostname; if (!FRAME_HOSTS.some((re) => re.test(host))) return null; } catch { return null; }
	}
	return v;
}

function safeStyle(value: string): string | null {
	const v = value.replace(/[\r\n]/g, " ");
	if (/expression\s*\(|javascript:|behavior\s*:|@import|url\s*\(\s*['"]?\s*(?!https?:|\/|data:image)/i.test(v)) return null;
	return v;
}

/** The markup with everything that could run or reach out removed. */
export function sanitizeHtml(input: string): string {
	let html = input ?? "";
	html = html.replace(/<!--[\s\S]*?-->/g, "");
	for (const t of DROP_WITH_CONTENT) html = html.replace(new RegExp(`<${t}\\b[^>]*>[\\s\\S]*?<\\/${t}\\s*>`, "gi"), "").replace(new RegExp(`<${t}\\b[^>]*\\/?>`, "gi"), "");
	return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g, (whole, rawTag: string, rawAttrs: string) => {
		const tag = rawTag.toLowerCase();
		const closing = whole.startsWith("</");
		if (!TAGS.has(tag)) return "";
		if (closing) return `</${tag}>`;
		const selfClose = /\/\s*$/.test(rawAttrs);
		const allowed = new Set([...GLOBAL_ATTRS, ...(TAG_ATTRS[tag] ?? [])]);
		const out: string[] = [];
		for (const m of rawAttrs.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
			const name = m[1]!.toLowerCase();
			if (!allowed.has(name) || name.startsWith("on")) continue;
			let value = m[3] ?? m[4] ?? m[5] ?? "";
			value = value.replace(/&#x?[0-9a-f]+;?/gi, (e) => { try { const code = e[2]?.toLowerCase() === "x" ? parseInt(e.slice(3), 16) : parseInt(e.slice(2), 10); return String.fromCodePoint(code); } catch { return ""; } });
			if (URL_ATTRS.has(name)) { const u = safeUrl(value, name, tag); if (u === null) continue; value = u; }
			if (name === "srcset" && /javascript:/i.test(value)) continue;
			if (name === "style") { const st = safeStyle(value); if (st === null) continue; value = st; }
			if (name === "target" && value === "_blank") out.push(`rel="noopener"`);
			out.push(`${name}="${value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`);
		}
		return `<${tag}${out.length ? " " + out.join(" ") : ""}${selfClose ? " /" : ""}>`;
	});
}

/** The row's CSS scoped to its wrapper, with imports, expressions and remote fetches stripped. */
export function scopeCss(input: string, scope: string): string {
	let css = (input ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
	css = css.replace(/@import[^;]*;?/gi, "").replace(/@charset[^;]*;?/gi, "").replace(/@namespace[^;]*;?/gi, "");
	css = css.replace(/expression\s*\([^)]*\)/gi, "").replace(/behavior\s*:[^;}]*/gi, "");
	css = css.replace(/url\s*\(\s*(['"]?)(?!https?:|\/|data:image)[^)]*\)/gi, "url()");
	return scopeRules(css, scope);
}
function scopeRules(css: string, scope: string): string {
	let out = ""; let i = 0;
	while (i < css.length) {
		const open = css.indexOf("{", i);
		if (open < 0) break;
		const head = css.slice(i, open).trim();
		const close = matchBrace(css, open);
		const body = css.slice(open + 1, close);
		if (head.startsWith("@")) {
			if (/^@(media|supports|container|layer)\b/i.test(head)) out += `${head}{${scopeRules(body, scope)}}`;
			else if (/^@(keyframes|font-face|page|property|counter-style)\b/i.test(head)) out += `${head}{${body}}`;
		} else if (head) {
			const selectors = head.split(",").map((sel) => { const t = sel.trim(); if (!t) return ""; if (/^(:root|html|body)\b/i.test(t)) return scope; return `${scope} ${t}`; }).filter(Boolean);
			if (selectors.length) out += `${selectors.join(",")}{${body}}`;
		}
		i = close + 1;
	}
	return out;
}
function matchBrace(css: string, open: number): number {
	let depth = 0;
	for (let j = open; j < css.length; j++) { if (css[j] === "{") depth++; else if (css[j] === "}") { depth--; if (depth === 0) return j; } }
	return css.length;
}
