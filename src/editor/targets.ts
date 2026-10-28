/**
 * What on a rendered section can be edited in place, read from the block's
 * own values rather than from markup: every string or text field with a
 * value (the block's and its repeater items'), every image field with a
 * stored file, and the markdown text of a Columns slot. The runtime matches
 * these against the DOM by exact text or by image key, so a theme needs no
 * markers of its own; a field whose text does not appear on the page simply
 * stays in the panel.
 */
import type { Block, BlockTypeSchema, FieldSchema } from "./ops";
import { fieldsOf } from "./ops";

export interface TextTarget {
	/** `headline`, or `slots.2.heading` inside a repeater. */
	path: string;
	value: string;
	/** A `text` field: newlines allowed, Enter does not save. */
	multiline: boolean;
	/** The field holds markdown (a Columns slot's text): edited as markdown, not matched by text. */
	markdown: boolean;
}

export interface ImageTarget {
	path: string;
	/** EmDash's storage key, or the plain URL, whichever the value carries. */
	key: string;
}

/** Fields whose value is an address, a name of something else, or a switch: never edited by typing on the page. */
const NOT_INLINE = /(^|_)(url|href|id|slug|kind|span|source|variant|tone|width|align|category|form|row|group|location|css_class|html|video_url|icon|columns|limit|layout)$/;

export const normText = (s: string): string => s.replace(/\s+/g, " ").trim();

function textOf(f: FieldSchema, value: unknown, path: string, markdown: boolean, out: TextTarget[]): void {
	if (f.type !== "string" && f.type !== "text") return;
	if (NOT_INLINE.test(f.slug)) return;
	if (typeof value !== "string" || !normText(value)) return;
	out.push({ path, value, multiline: f.type === "text", markdown });
}

/** The string and text fields of a block that can be edited in place, with their current values. */
export function textTargets(type: BlockTypeSchema, block: Block): TextTarget[] {
	const out: TextTarget[] = [];
	for (const f of fieldsOf(type, block._version)) {
		if (f.type === "repeater") {
			const items = Array.isArray(block[f.slug]) ? (block[f.slug] as Array<Record<string, unknown>>) : [];
			items.forEach((item, i) => {
				for (const s of f.validation?.subFields ?? []) {
					const markdown = type.slug === "columns" && f.slug === "slots" && s.slug === "text";
					textOf(s, item?.[s.slug], `${f.slug}.${i}.${s.slug}`, markdown, out);
				}
			});
			continue;
		}
		textOf(f, block[f.slug], f.slug, false, out);
	}
	return out;
}

function keyOf(v: unknown): string | null {
	if (!v || typeof v !== "object") return null;
	const o = v as { meta?: { storageKey?: string }; src?: string; url?: string };
	return o.meta?.storageKey ?? o.src ?? o.url ?? null;
}

/** The image fields of a block that hold a picture, with the key the rendered <img> carries. */
export function imageTargets(type: BlockTypeSchema, block: Block): ImageTarget[] {
	const out: ImageTarget[] = [];
	for (const f of fieldsOf(type, block._version)) {
		if (f.type === "repeater") {
			const items = Array.isArray(block[f.slug]) ? (block[f.slug] as Array<Record<string, unknown>>) : [];
			items.forEach((item, i) => {
				for (const s of f.validation?.subFields ?? []) {
					if (s.type !== "image") continue;
					const k = keyOf(item?.[s.slug]);
					if (k) out.push({ path: `${f.slug}.${i}.${s.slug}`, key: k });
				}
			});
			continue;
		}
		if (f.type !== "image") continue;
		const k = keyOf(block[f.slug]);
		if (k) out.push({ path: f.slug, key: k });
	}
	return out;
}

/** The value at a path (`slots.2.heading`), or undefined. */
export function getPath(block: Record<string, unknown>, path: string): unknown {
	let cur: unknown = block;
	for (const p of path.split(".")) {
		if (cur === null || typeof cur !== "object") return undefined;
		cur = (cur as Record<string, unknown>)[p];
	}
	return cur;
}

/** A copy of the block with `value` at `path`; a repeater item is copied, never mutated. */
export function setPath<T extends Record<string, unknown>>(block: T, path: string, value: unknown): T {
	const parts = path.split(".");
	const walk = (node: unknown, i: number): unknown => {
		const p = parts[i]!;
		if (i === parts.length - 1) {
			if (Array.isArray(node)) { const a = node.slice(); a[Number(p)] = value; return a; }
			return { ...(node as Record<string, unknown>), [p]: value };
		}
		if (Array.isArray(node)) { const a = node.slice(); a[Number(p)] = walk(a[Number(p)] ?? {}, i + 1); return a; }
		const o = (node as Record<string, unknown>) ?? {};
		return { ...o, [p]: walk(o[p] ?? {}, i + 1) };
	};
	return walk(block, 0) as T;
}

/** The label the inline pill shows for a path: the field's label, with the item number for a repeater entry. */
export function labelFor(type: BlockTypeSchema, block: Block, path: string): string {
	const [slug, idx, sub] = path.split(".");
	const fields = fieldsOf(type, block._version);
	const f = fields.find((x) => x.slug === slug);
	if (!f) return path;
	if (sub !== undefined) {
		const s = f.validation?.subFields?.find((x) => x.slug === sub);
		return `${f.label || f.slug} ${Number(idx) + 1}: ${s?.label || sub}`;
	}
	return f.label || f.slug;
}
