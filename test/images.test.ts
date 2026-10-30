import { describe, expect, it } from "vitest";
import { mediaKey, mediaSrcset, resizable, sizesFor, responsiveImgs, srcsetForSrc } from "../src/lib/images";

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
	it("gives a plain <img> of a stored picture in custom HTML its variants, and leaves the author's srcset alone", () => {
		const out = responsiveImgs(`<img src="/_emdash/api/media/file/01ABC.jpg" alt="Patio"><img src="/_emdash/api/media/file/01DEF.png" sizes="100vw"><img src="https://x.test/a.jpg"><img srcset="/x 1w" src="/_emdash/api/media/file/01GHI.jpg">`);
		expect(out).toContain(`<img srcset="/_tidy/img/480/01ABC.jpg 480w, /_tidy/img/800/01ABC.jpg 800w, /_tidy/img/1200/01ABC.jpg 1200w, /_tidy/img/1600/01ABC.jpg 1600w, /_emdash/api/media/file/01ABC.jpg 1920w" sizes="(min-width: 860px) 50vw, 100vw" src="/_emdash/api/media/file/01ABC.jpg" alt="Patio">`);
		expect(out).toContain(`<img srcset="/_tidy/img/480/01DEF.png 480w`);
		expect(out).toContain(`01DEF.png 1920w" src="/_emdash/api/media/file/01DEF.png" sizes="100vw">`);
		expect(out).toContain(`<img src="https://x.test/a.jpg">`);
		expect(out).toContain(`<img srcset="/x 1w" src="/_emdash/api/media/file/01GHI.jpg">`);
		expect(srcsetForSrc("/_emdash/api/media/file/logo.svg")).toBeNull();
	});
});
