/**
 * Markdown to HTML for the text a section slot holds (sections/columns). The
 * subset a page's copy needs: headings, paragraphs, bullet and numbered
 * lists, quotes, rules, bold, italic, inline code, links and images. Raw
 * HTML in the text is escaped, never rendered; the result still goes through
 * sanitizeHtml by the caller. A single newline inside a paragraph is a line
 * break, as people expect from a text box.
 */

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const safeHref = (url: string): string | null => {
	const u = url.trim();
	if (!u) return null;
	if (/^(#|\/(?!\/)|\.\/|\.\.\/)/.test(u)) return u;
	if (/^(mailto|tel|sms):/i.test(u)) return u;
	if (/^https?:\/\//i.test(u)) return u;
	return null;
};

/** Inline marks on already-escaped text. */
function inline(text: string): string {
	let s = text;
	// Images before links, since an image is a link with a bang.
	s = s.replace(/!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_m, alt: string, url: string) => {
		const href = safeHref(url);
		return href ? `<img src="${href}" alt="${alt}" loading="lazy">` : alt;
	});
	s = s.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_m, label: string, url: string) => {
		const href = safeHref(url);
		return href ? `<a href="${href}">${label}</a>` : label;
	});
	s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
	s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>");
	s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>").replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
	return s.replace(/\n/g, "<br>");
}

/** The HTML for a markdown text; empty text gives an empty string. */
export function markdownToHtml(input: string): string {
	const src = (input ?? "").replace(/\r\n?/g, "\n");
	if (!src.trim()) return "";
	const lines = src.split("\n");
	const out: string[] = [];
	let i = 0;
	const para: string[] = [];
	const flushPara = () => {
		if (!para.length) return;
		out.push(`<p>${inline(escapeHtml(para.join("\n")))}</p>`);
		para.length = 0;
	};
	while (i < lines.length) {
		const line = lines[i]!;
		const t = line.trim();
		if (!t) { flushPara(); i++; continue; }
		const h = /^(#{1,6})\s+(.*)$/.exec(t);
		if (h) { flushPara(); out.push(`<h${h[1]!.length}>${inline(escapeHtml(h[2]!.replace(/\s+#+$/, "")))}</h${h[1]!.length}>`); i++; continue; }
		if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); out.push("<hr>"); i++; continue; }
		if (/^>\s?/.test(t)) {
			flushPara();
			const q: string[] = [];
			while (i < lines.length && /^\s*>\s?/.test(lines[i]!)) { q.push(lines[i]!.replace(/^\s*>\s?/, "")); i++; }
			out.push(`<blockquote>${markdownToHtml(q.join("\n"))}</blockquote>`);
			continue;
		}
		const bullet = /^([-*+])\s+/.test(t);
		const numbered = /^\d+[.)]\s+/.test(t);
		if (bullet || numbered) {
			flushPara();
			const tag = bullet ? "ul" : "ol";
			const re = bullet ? /^\s*[-*+]\s+/ : /^\s*\d+[.)]\s+/;
			const items: string[] = [];
			while (i < lines.length && re.test(lines[i]!)) {
				let item = lines[i]!.replace(re, "");
				i++;
				// Continuation lines indented under the item.
				while (i < lines.length && /^\s{2,}\S/.test(lines[i]!) && !re.test(lines[i]!)) { item += "\n" + lines[i]!.trim(); i++; }
				items.push(`<li>${inline(escapeHtml(item))}</li>`);
			}
			out.push(`<${tag}>${items.join("")}</${tag}>`);
			continue;
		}
		para.push(t);
		i++;
	}
	flushPara();
	return out.join("\n");
}
