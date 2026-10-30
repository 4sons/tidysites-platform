/**
 * Rich text as HTML, for custom HTML that reads a record's written content
 * (`{{{ s.content_html }}}`). EmDash stores rich text as Portable Text: a
 * list of blocks, each with a style (normal, h1 to h4, blockquote), an
 * optional list item kind and level, children spans with marks (strong,
 * em, underline, code, or a key into markDefs for a link). This prints the
 * ordinary subset and leaves anything else out; the result goes through the
 * sanitizer like the rest of a row, so nothing here needs to be defensive
 * about what it prints beyond escaping text.
 */

interface Span { _type?: string; text?: string; marks?: string[] }
interface Block { _type?: string; style?: string; listItem?: string; level?: number; children?: Span[]; markDefs?: Array<{ _key: string; _type: string; href?: string }> }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Whether a value is rich text: a list whose items are blocks. */
export function isPortableText(v: unknown): v is Block[] {
	return Array.isArray(v) && v.length > 0 && v.every((b) => b && typeof b === "object" && typeof (b as Block)._type === "string");
}

function spanHtml(span: Span, defs: Block["markDefs"]): string {
	let out = esc(span.text ?? "").replace(/\n/g, "<br>");
	for (const m of span.marks ?? []) {
		if (m === "strong") out = `<strong>${out}</strong>`;
		else if (m === "em") out = `<em>${out}</em>`;
		else if (m === "underline") out = `<u>${out}</u>`;
		else if (m === "code") out = `<code>${out}</code>`;
		else if (m === "strike-through") out = `<s>${out}</s>`;
		else {
			const def = defs?.find((d) => d._key === m);
			if (def?._type === "link" && def.href) out = `<a href="${esc(def.href)}">${out}</a>`;
		}
	}
	return out;
}

export function portableTextToHtml(blocks: unknown): string {
	if (!isPortableText(blocks)) return "";
	const out: string[] = [];
	let list: { kind: string; level: number } | null = null;
	const closeList = () => { if (list) { out.push(list.kind === "number" ? "</ol>" : "</ul>"); list = null; } };
	for (const b of blocks) {
		if (b._type !== "block") { closeList(); continue; }
		const inner = (b.children ?? []).map((c) => spanHtml(c, b.markDefs)).join("");
		if (b.listItem) {
			const kind = b.listItem === "number" ? "number" : "bullet";
			if (!list || list.kind !== kind) { closeList(); out.push(kind === "number" ? "<ol>" : "<ul>"); list = { kind, level: b.level ?? 1 }; }
			out.push(`<li>${inner}</li>`);
			continue;
		}
		closeList();
		const style = b.style ?? "normal";
		if (/^h[1-6]$/.test(style)) out.push(`<${style}>${inner}</${style}>`);
		else if (style === "blockquote") out.push(`<blockquote>${inner}</blockquote>`);
		else if (inner.trim()) out.push(`<p>${inner}</p>`);
	}
	closeList();
	return out.join("");
}
