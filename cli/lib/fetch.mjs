/**
 * Read a page of the site being ported: the HTML with scripts, styles and
 * SVG noise taken out, and an outline (title, description, headings in
 * order, navigation, images with their alt, phone numbers and emails, the
 * stylesheets) so a builder can see the page's bones before deciding which
 * section each band becomes.
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export async function fetchPage(url, { fetchImpl = fetch } = {}) {
	const res = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow' });
	const html = await res.text();
	if (!res.ok) throw new Error(`${url} answered ${res.status}`);
	return { url: res.url || url, html };
}

const decode = (s) =>
	s
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const text = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** The HTML without what a builder never needs to read. */
export function cleanHtml(html) {
	return html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<(script|style|noscript|template|iframe)\b[\s\S]*?<\/\1>/gi, '')
		.replace(/<svg\b[\s\S]*?<\/svg>/gi, '<svg></svg>')
		.replace(/\son[a-z]+="[^"]*"/gi, '')
		.replace(/\sstyle="[^"]*"/gi, '')
		.replace(/\s(data-[a-z0-9-]+|class|id)="[^"]*"/gi, (m, name) => (name === 'class' || name === 'id' ? m : ''))
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n');
}

function abs(base, href) {
	try {
		return new URL(href, base).toString();
	} catch {
		return href;
	}
}

/** What the page is made of, in order. */
export function outline(html, base) {
	const out = { url: base, title: null, description: null, headings: [], nav: [], images: [], phones: [], emails: [], stylesheets: [], fonts: [], colors: [] };
	const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	if (t) out.title = text(t[1]);
	const d = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i);
	if (d) out.description = decode(d[1]).trim();
	// The rest of the page's SEO, so a port carries it over: canonical, robots, share tags, the icon, the structured data types.
	const meta = (attr, name) => { const m = html.match(new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${name}["']`, 'i')); return m ? decode(m[1]).trim() : null; };
	const link = (rel) => { const m = html.match(new RegExp(`<link[^>]+rel=["'][^"']*\\b${rel}\\b[^"']*["'][^>]*href=["']([^"']+)["']`, 'i')) || html.match(new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*\\b${rel}\\b[^"']*["']`, 'i')); return m ? abs(base, m[1]) : null; };
	out.seo = {
		canonical: link('canonical'),
		robots: meta('name', 'robots'),
		og_title: meta('property', 'og:title'), og_description: meta('property', 'og:description'), og_image: meta('property', 'og:image') ? abs(base, meta('property', 'og:image')) : null, og_type: meta('property', 'og:type'),
		twitter_card: meta('name', 'twitter:card'),
		favicon: link('icon') || link('shortcut icon') || abs(base, '/favicon.ico'),
		apple_touch_icon: link('apple-touch-icon'),
		schema_types: Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)).flatMap((m) => { try { const j = JSON.parse(m[1]); const list = Array.isArray(j) ? j : j['@graph'] ? j['@graph'] : [j]; return list.map((x) => x['@type']).filter(Boolean).flat(); } catch { return []; } }),
		lang: (html.match(/<html[^>]+lang=["']([^"']+)["']/i) || [])[1] ?? null
	};
	for (const m of html.matchAll(/<(h[1-4])\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
		const s = text(m[2]);
		if (s) out.headings.push({ level: Number(m[1][1]), text: s });
	}
	const navBlocks = [...html.matchAll(/<nav\b[\s\S]*?<\/nav>/gi)].map((m) => m[0]);
	const navSource = navBlocks.length ? navBlocks.join('\n') : (html.match(/<header\b[\s\S]*?<\/header>/i)?.[0] ?? '');
	const seen = new Set();
	for (const m of navSource.matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
		const label = text(m[2]);
		const href = abs(base, m[1]);
		if (label && !seen.has(href)) {
			seen.add(href);
			out.nav.push({ label, href });
		}
	}
	for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
		const tag = m[0];
		const src = tag.match(/\s(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i)?.[1];
		if (!src || /^data:/.test(src)) continue;
		const alt = decode(tag.match(/\salt=["']([^"']*)["']/i)?.[1] ?? '');
		const width = tag.match(/\swidth=["']?(\d+)/i)?.[1];
		const height = tag.match(/\sheight=["']?(\d+)/i)?.[1];
		out.images.push({ src: abs(base, src), alt, ...(width ? { width: Number(width) } : {}), ...(height ? { height: Number(height) } : {}) });
	}
	const body = text(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ''));
	out.phones = [...new Set([...body.matchAll(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g)].map((m) => m[0].trim()))].slice(0, 10);
	out.emails = [...new Set([...body.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].map((m) => m[0]))].slice(0, 10);
	for (const m of html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)) {
		const href = m[0].match(/\shref=["']([^"']+)["']/i)?.[1];
		if (href) out.stylesheets.push(abs(base, href));
	}
	for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?[^"'<>\s]+/gi)) {
		const fams = [...m[0].matchAll(/family=([^&:]+)/g)].map((f) => decodeURIComponent(f[1]).replace(/\+/g, ' '));
		out.fonts.push(...fams);
	}
	out.fonts = [...new Set(out.fonts)];
	return out;
}

/** The colours and font families a stylesheet leans on, most used first. */
export function cssSummary(css) {
	const colors = new Map();
	for (const m of css.matchAll(/#(?:[0-9a-f]{3}){1,2}\b|rgba?\([^)]*\)/gi)) {
		const c = m[0].toLowerCase();
		if (/^#(?:fff|ffffff|000|000000)$/.test(c)) continue;
		colors.set(c, (colors.get(c) ?? 0) + 1);
	}
	const fonts = new Map();
	for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
		const f = m[1].split(',')[0].replace(/["']/g, '').trim();
		if (f && !/^(inherit|initial|unset|var\()/.test(f)) fonts.set(f, (fonts.get(f) ?? 0) + 1);
	}
	// The site's own names for its colours and fonts, when its stylesheet defines them; a framework's defaults sit below
	// these. A builder often defines a token as another token (--button-fill: rgb(var(--color_48)); --color_48: 254,96,47):
	// the references are followed so the list reads as colours, and bare channel triplets become rgb().
	const defined = {};
	for (const m of css.matchAll(/--([a-zA-Z][\w-]*)\s*:\s*([^;}]+)/g)) if (!(m[1] in defined)) defined[m[1]] = m[2].trim();
	const resolve = (v, depth = 0) => (depth > 4 ? v : v.replace(/var\(\s*--([\w-]+)\s*(?:,[^)]*)?\)/g, (_, name) => (name in defined ? resolve(defined[name], depth + 1) : `var(--${name})`)));
	const variables = {};
	for (const [name, raw] of Object.entries(defined)) {
		let v = resolve(raw).replace(/rgba?\(\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\s*\)/g, 'rgb($1,$2,$3)');
		if (/^\d{1,3},\s*\d{1,3},\s*\d{1,3}$/.test(v)) v = `rgb(${v.replace(/\s/g, '')})`;
		if (/var\(/.test(v)) continue;
		if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|font|["'][A-Z][\w ]+["']/i.test(v)) variables[name] = v;
	}
	const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));
	return { colors: top(colors, 12), fonts: top(fonts, 6), variables };
}

export function outlineText(o) {
	const lines = [];
	lines.push(`URL: ${o.url}`);
	if (o.title) lines.push(`Title: ${o.title}`);
	if (o.description) lines.push(`Description: ${o.description}`);
	if (o.seo) {
		lines.push('', 'SEO (carry these over: meta_title, meta_description, canonical, share image, schema; the icon onto the Business record):');
		for (const [k, v] of Object.entries(o.seo)) if (v && (!Array.isArray(v) || v.length)) lines.push(`  ${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
	}
	if (o.nav.length) {
		lines.push('', 'Navigation:');
		for (const n of o.nav) lines.push(`  ${n.label}  →  ${n.href}`);
	}
	if (o.headings.length) {
		lines.push('', 'Headings, in order:');
		for (const h of o.headings) lines.push(`  ${'#'.repeat(h.level)} ${h.text}`);
	}
	if (o.images.length) {
		lines.push('', `Images (${o.images.length}):`);
		for (const i of o.images.slice(0, 60)) lines.push(`  ${i.src}${i.width ? ` (${i.width}x${i.height ?? '?'})` : ''}${i.alt ? `  alt: ${i.alt}` : ''}`);
	}
	if (o.phones.length) lines.push('', `Phones: ${o.phones.join(', ')}`);
	if (o.emails.length) lines.push(`Emails: ${o.emails.join(', ')}`);
	if (o.fonts.length) lines.push(`Google fonts: ${o.fonts.join(', ')}`);
	if (o.css) {
		const vars = Object.entries(o.css.variables ?? {});
		if (vars.length) { lines.push('', 'Stylesheet variables (the site\'s own names; trust these over the counts below):'); for (const [k, v] of vars.slice(0, 40)) lines.push(`  --${k}: ${v}`); }
		lines.push('', 'Stylesheet colours (most used first):', `  ${o.css.colors.map((c) => `${c.value} ×${c.count}`).join('  ')}`);
		lines.push('Stylesheet fonts:', `  ${o.css.fonts.map((c) => `${c.value} ×${c.count}`).join('  ')}`);
	}
	if (o.stylesheets.length) {
		lines.push('', 'Stylesheets:');
		for (const s of o.stylesheets) lines.push(`  ${s}`);
	}
	return `${lines.join('\n')}\n`;
}
