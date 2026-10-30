/**
 * Responsive pictures without a second upload. Every stored image can be
 * served at a few widths through `/_tidy/img/<width>/<key>` (routes/img),
 * and these helpers print the `srcset` and `sizes` the template's pictures
 * carry. Pure: the storage key comes from the stored media value.
 */

export const IMAGE_WIDTHS = [480, 800, 1200, 1600] as const;

/** Where a picture sits, as a `sizes` hint: how wide it is on a laptop, full width on a phone. */
export const SIZES = {
	full: "100vw",
	half: "(min-width: 860px) 50vw, 100vw",
	third: "(min-width: 860px) 33vw, (min-width: 600px) 50vw, 100vw",
	quarter: "(min-width: 860px) 25vw, (min-width: 600px) 50vw, 100vw",
	icon: "120px"
} as const;
export type SizeKind = keyof typeof SIZES;

/** The storage key of a stored media value, or null for a plain URL or an empty field. */
export function mediaKey(v: unknown): string | null {
	if (!v || typeof v !== "object") return null;
	const o = v as { meta?: { storageKey?: unknown }; image?: { meta?: { storageKey?: unknown } } | null };
	const k = o.meta?.storageKey ?? o.image?.meta?.storageKey;
	return typeof k === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(k) && !k.includes("..") ? k : null;
}

/** Whether the resizer can serve this file: a raster image, not an SVG or a GIF (which keep their original). */
export function resizable(v: unknown): boolean {
	const key = mediaKey(v);
	if (!key) return false;
	const o = v as { mimeType?: unknown; image?: { mimeType?: unknown } | null };
	const type = String(o.mimeType ?? o.image?.mimeType ?? "");
	if (type) return /^image\/(jpeg|png|webp|avif)$/.test(type);
	return /\.(jpe?g|png|webp|avif)$/i.test(key);
}

/** The variant address for one width. */
export const variantUrl = (key: string, width: number): string => `/_tidy/img/${width}/${key}`;

/**
 * The `srcset` for a stored picture: each width the resizer offers, up to the
 * picture's own width when known (a 900px photo gets 480 and 800, then the
 * original as the widest). Null when the picture cannot be resized.
 */
export function mediaSrcset(v: unknown): string | null {
	if (!resizable(v)) return null;
	const key = mediaKey(v)!;
	const o = v as { width?: unknown; image?: { width?: unknown } | null };
	const own = Number(o.width ?? o.image?.width ?? 0) || 0;
	const parts: string[] = [];
	for (const w of IMAGE_WIDTHS) {
		if (own && w >= own) break;
		parts.push(`${variantUrl(key, w)} ${w}w`);
	}
	if (own) parts.push(`/_emdash/api/media/file/${key} ${own}w`);
	else parts.push(`/_emdash/api/media/file/${key} 1920w`);
	return parts.join(", ");
}

/** The `sizes` hint for a place in the layout. */
export const sizesFor = (kind: SizeKind | undefined): string => SIZES[kind ?? "half"];

/** The `sizes` of a header or footer logo: never wider than its slot. */
export const LOGO_SIZES = "(min-width: 860px) 240px, 160px";

const MEDIA_FILE = /^\/_emdash\/api\/media\/file\/([A-Za-z0-9][A-Za-z0-9._-]*)$/;

/** The `srcset` for a stored picture known only by its address (custom HTML), or null when it is not a resizable file. */
export function srcsetForSrc(src: string): string | null {
	const key = MEDIA_FILE.exec(src)?.[1];
	if (!key || key.includes("..") || !/\.(jpe?g|png|webp|avif)$/i.test(key)) return null;
	return mediaSrcset({ meta: { storageKey: key } });
}

/**
 * Custom HTML prints a stored picture as a plain `<img src="…">` more often
 * than not. Give every such picture the resized variants it would have had
 * through a section, so a phone downloads a phone-sized file: a `srcset`
 * where there is none, and a `sizes` hint (half the laptop, the whole phone)
 * where the author gave none. A picture that already carries a `srcset` is
 * the author's.
 */
export function responsiveImgs(html: string, sizes: string = SIZES.half): string {
	return html.replace(/<img\b([^>]*)>/gi, (whole, attrs: string) => {
		if (/\bsrcset=/i.test(attrs)) return whole;
		const src = /\bsrc="([^"]*)"/i.exec(attrs)?.[1];
		const srcset = src ? srcsetForSrc(src) : null;
		if (!srcset) return whole;
		const hint = /\bsizes=/i.test(attrs) ? "" : ` sizes="${sizes}"`;
		return `<img srcset="${srcset}"${hint}${attrs}>`;
	});
}
