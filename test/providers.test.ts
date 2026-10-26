import { describe, expect, it } from "vitest";
import { bookingEmbedUrl, pixelId, providerId, providerSnippets, reviewsWidgetHtml } from "../src/lib/providers";

describe("providerId", () => {
	it("reads a Crisp id from the pasted embed or takes it bare", () => {
		const pasted = `<script type="text/javascript">window.$crisp=[];window.CRISP_WEBSITE_ID="a1b2c3d4-e5f6-7890-abcd-ef1234567890";(function(){d=document;s=d.createElement("script");s.src="https://client.crisp.chat/l.js";})();</script>`;
		expect(providerId("chat", "Crisp", pasted)).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
		expect(providerId("chat", "Crisp", " a1b2c3d4-e5f6-7890-abcd-ef1234567890 ")).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
		expect(providerId("chat", "Crisp", "not an id")).toBe("");
	});
	it("reads Tawk, Tidio, LiveChat and Podium ids from their embeds", () => {
		expect(providerId("chat", "Tawk.to", `s1.src='https://embed.tawk.to/5f1e2d3c4b5a6978901234ab/1abcdefgh';`)).toBe("5f1e2d3c4b5a6978901234ab/1abcdefgh");
		expect(providerId("chat", "Tidio", `<script src="//code.tidio.co/abcdefghijklmnopqrstuvwxyz.js" async></script>`)).toBe("abcdefghijklmnopqrstuvwxyz");
		expect(providerId("chat", "LiveChat", `window.__lc.license = 12345678;`)).toBe("12345678");
		expect(providerId("chat", "Podium", `<script src="https://connect.podium.com/widget.js#abc123-def" id="podium-widget" data-organization-id="abc123-def" async></script>`)).toBe("abc123-def");
	});
	it("reads reviews widget ids", () => {
		expect(providerId("reviews", "Trustindex", `<script defer async src='https://cdn.trustindex.io/loader.js?0123456789abcdef01234'></script>`)).toBe("0123456789abcdef01234");
		expect(providerId("reviews", "Elfsight", `<div class="elfsight-app-11111111-2222-3333-4444-555555555555" data-elfsight-app-lazy></div>`)).toBe("11111111-2222-3333-4444-555555555555");
		expect(providerId("reviews", "Birdeye", `<script src="https://birdeye.com/embed/v7/160000000000/9/1234567890"></script>`)).toBe("160000000000/9/1234567890");
	});
	it("takes only a booking page on the provider's own host", () => {
		expect(providerId("booking", "Calendly", `<div class="calendly-inline-widget" data-url="https://calendly.com/atelier/make-up?hide_gdpr_banner=1"></div>`)).toBe("https://calendly.com/atelier/make-up");
		expect(bookingEmbedUrl("Calendly", "https://evil.example/calendly.com/x")).toBeNull();
		expect(bookingEmbedUrl("Pike13", "https://atelier.pike13.com/schedule")).toBe("https://atelier.pike13.com/schedule");
	});
	it("refuses a provider not on the list", () => {
		expect(providerId("chat", "Intercom", "abc")).toBe("");
	});
});

describe("pixelId", () => {
	it("reads the Meta pixel and Google Ads ids from snippets or bare", () => {
		expect(pixelId("meta", `fbq('init', '1234567890123456');`)).toBe("1234567890123456");
		expect(pixelId("meta", "1234567890123456")).toBe("1234567890123456");
		expect(pixelId("google_ads", `gtag('config', 'AW-123456789');`)).toBe("AW-123456789");
		expect(pixelId("google_ads", "123456789")).toBe("AW-123456789");
	});
});

describe("snippets", () => {
	it("renders the package's own snippet with the id escaped and nothing else from the paste", () => {
		const s = providerSnippets({ chatProvider: "Crisp", chatId: `window.CRISP_WEBSITE_ID="a1b2c3d4-e5f6-7890-abcd-ef1234567890";<script>alert(1)</script>`, reviewsWidget: "", reviewsWidgetId: "", metaPixelId: "1234567890123456", googleAdsId: "" });
		expect(s.body).toHaveLength(1);
		expect(s.body[0]).toContain(`CRISP_WEBSITE_ID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"`);
		expect(s.body[0]).not.toContain("alert");
		expect(s.head).toHaveLength(1);
		expect(s.head[0]).toContain("fbq('init','1234567890123456')");
	});
	it("renders nothing for an unknown or empty provider", () => {
		expect(providerSnippets({ chatProvider: "Intercom", chatId: "x", reviewsWidget: "", reviewsWidgetId: "", metaPixelId: "", googleAdsId: "" })).toEqual({ head: [], body: [] });
		expect(reviewsWidgetHtml("Trustindex", "")).toBeNull();
	});
});
