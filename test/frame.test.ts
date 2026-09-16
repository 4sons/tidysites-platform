import { describe, expect, it } from "vitest";
import { applyFramePolicy, frameAncestors } from "../src/lib/frame";

describe("frameAncestors", () => {
	it("reads space or comma separated https origins and drops anything else", () => {
		expect(frameAncestors("https://app.tideworthy.com https://my.seobrothers.com")).toEqual(["https://app.tideworthy.com", "https://my.seobrothers.com"]);
		expect(frameAncestors("https://a.example,https://a.example, http://plain.example javascript:alert(1) https://b.example/path")).toEqual(["https://a.example"]);
		expect(frameAncestors(undefined)).toEqual([]);
		expect(frameAncestors("")).toEqual([]);
	});
});

describe("applyFramePolicy", () => {
	it("replaces X-Frame-Options with a frame-ancestors policy", () => {
		const h = new Headers({ "X-Frame-Options": "SAMEORIGIN" });
		expect(applyFramePolicy(h, ["https://app.tideworthy.com"])).toBe(true);
		expect(h.get("X-Frame-Options")).toBeNull();
		expect(h.get("Content-Security-Policy")).toBe("frame-ancestors 'self' https://app.tideworthy.com");
	});
	it("appends to an existing policy that lacks frame-ancestors and leaves one that has it", () => {
		const h = new Headers({ "Content-Security-Policy": "default-src 'self';" });
		applyFramePolicy(h, ["https://a.example"]);
		expect(h.get("Content-Security-Policy")).toBe("default-src 'self'; frame-ancestors 'self' https://a.example");
		const kept = new Headers({ "Content-Security-Policy": "frame-ancestors 'none'" });
		expect(applyFramePolicy(kept, ["https://a.example"])).toBe(false);
		expect(kept.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
	});
	it("does nothing without ancestors", () => {
		const h = new Headers({ "X-Frame-Options": "SAMEORIGIN" });
		expect(applyFramePolicy(h, [])).toBe(false);
		expect(h.get("X-Frame-Options")).toBe("SAMEORIGIN");
	});
});
