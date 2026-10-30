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
