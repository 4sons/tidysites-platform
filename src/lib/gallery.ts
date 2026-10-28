/**
 * Sample sections for the gallery (/_tidy/gallery): one block per section
 * type and layout, filled with obvious sample text so a person or a builder
 * can see what every type and variant looks like in this theme before
 * choosing one. The sections that read records show the site's own records.
 */
import type { SectionType, TemplateField } from "../template/index";

export interface GallerySample { label: string; block: Record<string, unknown> }
export interface GalleryGroup { slug: string; label: string; description: string; samples: GallerySample[] }

const SENTENCE = "Sample text for this section: a sentence or two a builder replaces with the site's own words, long enough to show how a paragraph sits.";
const SAMPLE_HTML = '<div style="padding:24px;border:2px dashed currentColor;border-radius:12px;text-align:center">Your own markup renders here, sanitised: nothing in it runs.</div>';

function sampleFor(f: TemplateField, i: number, variant: string): unknown {
	switch (f.type) {
		case "string":
			if (/eyebrow/.test(f.slug)) return "Eyebrow";
			if (/headline|title/.test(f.slug)) return `${variant}`;
			if (/^button2_label$/.test(f.slug)) return "Second button";
			if (/button_label|submit_label|link_label|cta_label/.test(f.slug)) return "Button";
			if (/pill/.test(f.slug)) return "Pill";
			if (/label$/.test(f.slug)) return `Label ${i}`;
			if (/value/.test(f.slug)) return `${(i + 1) * 12}`;
			if (/_url$|^url$/.test(f.slug)) return "#";
			if (/icon/.test(f.slug)) return "★";
			if (/source/.test(f.slug)) return "Google";
			return `Sample ${f.label.toLowerCase()}`;
		case "text":
			if (/bullets/.test(f.slug)) return "First point\nSecond point\nThird point";
			if (/steps/.test(f.slug)) return "Call: a short line.\nVisit: another short line.\nDone: the last one.";
			return SENTENCE;
		case "url":
			return "";
		case "boolean":
			return /^show_|^grouped$|^lightbox$|^show_all$/.test(f.slug);
		case "integer":
		case "number":
			return f.slug === "across" ? 3 : f.slug === "limit" ? 3 : f.slug === "height" ? 240 : 3;
		case "select": {
			const opts = ((f.validation?.options as string[] | undefined) ?? (f as { options?: string[] }).options ?? []);
			return f.defaultValue ?? opts[0];
		}
		default:
			return undefined;
	}
}

function sampleBlock(type: SectionType, variantField: string | null, variant: string): Record<string, unknown> {
	const fields = type.versions.find((v) => v.version === type.currentVersion)?.fields ?? [];
	const block: Record<string, unknown> = { _type: type.slug, _key: `g-${type.slug}-${variant.replace(/[^a-z0-9]+/gi, "-")}` };
	for (const f of fields) {
		if (variantField && f.slug === variantField) { block[f.slug] = variant; continue; }
		if (f.type === "repeater") {
			const subs = (f.validation?.subFields as TemplateField[] | undefined) ?? [];
			block[f.slug] = [0, 1, 2].map((i) => {
				const item: Record<string, unknown> = {};
				for (const s of subs) {
					if (s.type === "image") continue;
					if (s.slug === "kind") { item.kind = i === 0 ? "text" : "card"; continue; }
					if (s.slug === "span") { item.span = i === 0 ? "full row" : "one column"; continue; }
					const v = sampleFor(s, i, `${type.label} ${i + 1}`);
					if (v !== undefined && v !== "") item[s.slug] = v;
				}
				return item;
			});
			continue;
		}
		if (f.type === "image" || f.type === "file" || f.type === "portableText" || f.type === "multiSelect" || f.type === "datetime") continue;
		const v = sampleFor(f, 0, `${type.label}${variant && variant !== "default" ? `: ${variant}` : ""}`);
		if (v !== undefined && v !== "") block[f.slug] = v;
	}
	if (type.slug === "row") { block.html = SAMPLE_HTML; delete block.row; }
	if (type.slug === "custom") { block.html = SAMPLE_HTML; block.height = 120; }
	if (type.slug === "columns") {
		block.across = 3;
		block.slots = [
			{ kind: "text", span: "full row", heading: "Columns: an intro slot across the row", text: "Each slot below is a **card**; a slot can also be text, an image, a number, a form, a video or your own HTML." },
			{ kind: "card", heading: "A card", text: "Icon, heading, text and a link.", link_label: "Read more", link_url: "#" },
			{ kind: "number", value: "140", label: "a number slot" },
			{ kind: "text", heading: "A text slot", text: "Markdown: *italic*, **bold**, a [link](#).\n\n- a list\n- of points" }
		];
	}
	return block;
}

/** The variant field of a type (its layout picker), if it has one. */
function variantField(type: SectionType): TemplateField | null {
	const fields = type.versions.find((v) => v.version === type.currentVersion)?.fields ?? [];
	return fields.find((f) => f.slug === "variant" && f.type === "select") ?? null;
}

/** Types the gallery leaves out: they depend on the page they are on. */
const SKIP = new Set(["related", "saved"]);

export function gallery(types: SectionType[]): GalleryGroup[] {
	return types
		.filter((t) => !SKIP.has(t.slug))
		.map((t) => {
			const vf = variantField(t);
			const variants = vf ? ((vf.validation?.options as string[] | undefined) ?? []) : [];
			const samples = variants.length
				? variants.map((v) => ({ label: `${t.label}: ${v}`, block: sampleBlock(t, "variant", v) }))
				: [{ label: t.label, block: sampleBlock(t, null, "default") }];
			return { slug: t.slug, label: t.label, description: t.description ?? "", samples };
		});
}
