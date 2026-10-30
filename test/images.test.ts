import { describe, expect, it } from "vitest";
import { mediaKey, mediaSrcset, resizable, sizesFor } from "../src/lib/images";

const stored = { provider: "local", id: "01M", mimeType: "image/webp", width: 1000, height: 600, meta: { storageKey: "01MKEY.webp" } };

describe("responsive pictures", () => {
	it("reads the storage key from a stored value and refuses a plain URL", () => {
		expect(mediaKey(stored)).toBe("01MKEY.webp");
		expect(mediaKey({ image: stored })).toBe("01MKEY.webp");
		expect(mediaKey("https://x.test/a.jpg")).toBeNull();
		expect(mediaKey({ meta: { storageKey: "../etc" } })).toBeNull();
	});
	it("prints the variants below the picture's own width, then the original", () => {
		expect(mediaSrcset(stored)).toBe("/_tidy/img/480/01MKEY.webp 480w, /_tidy/img/800/01MKEY.webp 800w, /_emdash/api/media/file/01MKEY.webp 1000w");
		expect(mediaSrcset({ ...stored, width: undefined })).toBe("/_tidy/img/480/01MKEY.webp 480w, /_tidy/img/800/01MKEY.webp 800w, /_tidy/img/1200/01MKEY.webp 1200w, /_tidy/img/1600/01MKEY.webp 1600w, /_emdash/api/media/file/01MKEY.webp 1920w");
	});
	it("leaves SVG, GIF and plain URLs alone", () => {
		expect(resizable({ ...stored, mimeType: "image/svg+xml", meta: { storageKey: "a.svg" } })).toBe(false);
		expect(resizable({ ...stored, mimeType: "image/gif" })).toBe(false);
		expect(mediaSrcset("https://x.test/a.jpg")).toBeNull();
		expect(resizable({ meta: { storageKey: "b.PNG" } })).toBe(true);
	});
	it("gives a sizes hint per place", () => {
		expect(sizesFor("full")).toBe("100vw");
		expect(sizesFor(undefined)).toContain("50vw");
	});
});
