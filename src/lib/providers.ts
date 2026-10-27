/**
 * Third parties a site runs by id: live chat, a reviews widget, a booking
 * embed, pixels. The Business record holds an id (or the whole embed code a
 * vendor handed over, from which the id is read) and the frame renders the
 * package's own fixed snippet for that provider with the id escaped. Nothing
 * a person types becomes script: a provider not on this list has no door, on
 * purpose, and there is no free "paste your head code" field (see README,
 * "Third parties").
 */
export type ChatProvider = "Crisp" | "Tawk.to" | "Tidio" | "LiveChat" | "Podium";
export type ReviewsProvider = "Trustindex" | "Elfsight" | "Birdeye";
export type BookingProvider = "Calendly" | "Pike13" | "Square Appointments" | "Acuity" | "Jobber";
export type InstagramProvider = "Elfsight" | "Behold";
export type AccessibilityProvider = "UserWay" | "accessiBe";

const esc = (s: string) => s.replace(/[^A-Za-z0-9_\-:./]/g, "");
const first = (s: string, res: RegExp[]): string => { for (const re of res) { const m = re.exec(s); if (m?.[1]) return m[1]; } return ""; };
const bare = (s: string, re: RegExp) => (re.test(s.trim()) ? s.trim() : "");

/** The id a provider needs, from a bare id or from the embed code the vendor hands out. Empty when neither is recognised. */
export function providerId(kind: "chat", provider: ChatProvider | string, pasted: string): string;
export function providerId(kind: "reviews", provider: ReviewsProvider | string, pasted: string): string;
export function providerId(kind: "booking", provider: BookingProvider | string, pasted: string): string;
export function providerId(kind: "instagram", provider: InstagramProvider | string, pasted: string): string;
export function providerId(kind: "accessibility", provider: AccessibilityProvider | string, pasted: string): string;
export function providerId(kind: "chat" | "reviews" | "booking" | "instagram" | "accessibility", provider: string, pasted: string): string {
	const s = (pasted ?? "").trim();
	if (!s) return "";
	switch (`${kind}:${provider}`) {
		case "chat:Crisp": return first(s, [/CRISP_WEBSITE_ID\s*=\s*["']([0-9a-f-]{36})["']/i]) || bare(s, /^[0-9a-f-]{36}$/i);
		case "chat:Tawk.to": return first(s, [/embed\.tawk\.to\/([0-9a-f]{24}\/[0-9a-z]+)/i]) || bare(s, /^[0-9a-f]{24}\/[0-9a-z]+$/i);
		case "chat:Tidio": return first(s, [/code\.tidio\.co\/([a-z0-9]+)\.js/i]) || bare(s, /^[a-z0-9]{20,}$/i);
		case "chat:LiveChat": return first(s, [/__lc\.license\s*=\s*(\d+)/]) || bare(s, /^\d{5,}$/);
		case "chat:Podium": return first(s, [/connect\.podium\.com\/widget\.js#([A-Za-z0-9-]+)/, /podium\.com\/widget\.js\?.*?id=([A-Za-z0-9-]+)/]) || bare(s, /^[A-Za-z0-9-]{8,}$/);
		case "reviews:Trustindex": return first(s, [/cdn\.trustindex\.io\/loader\.js\?([0-9a-f]+)/i]) || bare(s, /^[0-9a-f]{20,}$/i);
		case "reviews:Elfsight": return first(s, [/elfsight-app-([0-9a-f-]{36})/i]) || bare(s, /^[0-9a-f-]{36}$/i);
		case "reviews:Birdeye": return first(s, [/birdeye\.com\/embed\/v\d\/(\d+)\/(\d+)\/(\d+)/]) ? (/birdeye\.com\/embed\/v\d\/(\d+\/\d+\/\d+)/.exec(s)?.[1] ?? "") : bare(s, /^\d+\/\d+\/\d+$/);
		case "booking:Calendly": return first(s, [/(https:\/\/calendly\.com\/[A-Za-z0-9_\-/]+)/]);
		case "booking:Pike13": return first(s, [/(https:\/\/[a-z0-9-]+\.pike13\.com\/[A-Za-z0-9_\-/?=&]+)/i]);
		case "booking:Square Appointments": return first(s, [/(https:\/\/(?:app\.)?squareup\.com\/appointments\/[A-Za-z0-9_\-/]+|https:\/\/book\.squareup\.com\/[A-Za-z0-9_\-/]+)/]);
		case "booking:Acuity": return first(s, [/(https:\/\/[a-z0-9-]+\.as\.me\/[A-Za-z0-9_\-/?=&]*|https:\/\/app\.acuityscheduling\.com\/schedule\.php\?owner=\d+)/i]);
		case "booking:Jobber": return first(s, [/(https:\/\/clienthub\.getjobber\.com\/[A-Za-z0-9_\-/]+)/]);
		case "instagram:Elfsight": return first(s, [/elfsight-app-([0-9a-f-]{36})/i]) || bare(s, /^[0-9a-f-]{36}$/i);
		case "instagram:Behold": return first(s, [/feeds\.behold\.so\/([A-Za-z0-9]+)/, /feed-id=["']([A-Za-z0-9]+)["']/]) || bare(s, /^[A-Za-z0-9]{10,}$/);
		case "accessibility:UserWay": return first(s, [/data-account=["']([A-Za-z0-9]+)["']/]) || bare(s, /^[A-Za-z0-9]{8,}$/);
		// accessiBe keys its widget by domain; the snippet carries no id, so any paste (or "on") turns it on.
		case "accessibility:accessiBe": return s ? "on" : "";
		default: return "";
	}
}

/** A pixel id from a bare id or the vendor's snippet. */
export function pixelId(kind: "meta" | "google_ads", pasted: string): string {
	const s = (pasted ?? "").trim();
	if (!s) return "";
	if (kind === "meta") return first(s, [/fbq\(\s*['"]init['"]\s*,\s*['"](\d{10,20})['"]/, /tr\?id=(\d{10,20})/]) || bare(s, /^\d{10,20}$/);
	return first(s, [/(AW-\d{6,})/]) || (/^\d{6,}$/.test(s) ? `AW-${s}` : "");
}

export interface Snippets { head: string[]; body: string[] }

/** The frame's own snippets for the providers a business record names. Every id goes through `esc`; the snippets are fixed. */
export function providerSnippets(input: { chatProvider: string; chatId: string; reviewsWidget: string; reviewsWidgetId: string; metaPixelId: string; googleAdsId: string; accessibilityWidget?: string; accessibilityWidgetId?: string }): Snippets {
	const out: Snippets = { head: [], body: [] };
	const a11y = providerId("accessibility", input.accessibilityWidget ?? "", input.accessibilityWidgetId ?? "");
	if (a11y && input.accessibilityWidget === "UserWay") out.body.push(`<script src="https://cdn.userway.org/widget.js" data-account="${esc(a11y)}"></script>`);
	if (a11y && input.accessibilityWidget === "accessiBe") out.body.push(`<script>(function(){var s=document.createElement("script");s.src="https://acsbapp.com/apps/app/dist/js/app.js";s.async=true;s.onload=function(){acsbJS.init({});};document.body.appendChild(s);})();</script>`);
	const chat = providerId("chat", input.chatProvider, input.chatId);
	if (chat) {
		const id = esc(chat);
		if (input.chatProvider === "Crisp") out.body.push(`<script>window.$crisp=[];window.CRISP_WEBSITE_ID="${id}";(function(){var d=document,s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();</script>`);
		if (input.chatProvider === "Tawk.to") out.body.push(`<script>var Tawk_API=Tawk_API||{};(function(){var s=document.createElement("script");s.async=true;s.src="https://embed.tawk.to/${id}";s.charset="UTF-8";s.setAttribute("crossorigin","*");document.head.appendChild(s);})();</script>`);
		if (input.chatProvider === "Tidio") out.body.push(`<script src="https://code.tidio.co/${id}.js" async></script>`);
		if (input.chatProvider === "LiveChat") out.body.push(`<script>window.__lc=window.__lc||{};window.__lc.license=${Number(id) || 0};(function(n,t,c){function i(n){return e._h?e._h.apply(null,n):e._q.push(n)}var e={_q:[],_h:null,_v:"2.0",on:function(){i(["on",c.call(arguments)])},once:function(){i(["once",c.call(arguments)])},off:function(){i(["off",c.call(arguments)])},get:function(){if(!e._h)throw new Error("[LiveChatWidget] You can't use getters before load.");return i(["get",c.call(arguments)])},call:function(){i(["call",c.call(arguments)])},init:function(){var n=t.createElement("script");n.async=!0,n.type="text/javascript",n.src="https://cdn.livechatinc.com/tracking.js",t.head.appendChild(n)}};!n.__lc.asyncInit&&e.init(),n.LiveChatWidget=n.LiveChatWidget||e}(window,document,[].slice))</script>`);
		if (input.chatProvider === "Podium") out.body.push(`<script src="https://connect.podium.com/widget.js#${id}" id="podium-widget" data-organization-id="${id}" async></script>`);
	}
	const meta = pixelId("meta", input.metaPixelId);
	if (meta) out.head.push(`<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${esc(meta)}');fbq('track','PageView');</script>`);
	const ads = pixelId("google_ads", input.googleAdsId);
	if (ads) out.head.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(ads)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(ads)}');</script>`);
	return out;
}

/** The markup for a reviews widget placed in a page, or null when none is set. */
export function reviewsWidgetHtml(provider: string, pasted: string): string | null {
	const id = esc(providerId("reviews", provider, pasted));
	if (!id) return null;
	if (provider === "Trustindex") return `<script defer async src="https://cdn.trustindex.io/loader.js?${id}"></script>`;
	if (provider === "Elfsight") return `<script src="https://static.elfsight.com/platform/platform.js" async></script><div class="elfsight-app-${id}" data-elfsight-app-lazy></div>`;
	if (provider === "Birdeye") return `<script src="https://birdeye.com/embed/v7/${id}" async></script><div id="bf-revz-widget-${id.split("/").pop()}"></div>`;
	return null;
}

/** The booking page to frame inline, or null. Only a URL on the provider's own host is accepted. */
export function bookingEmbedUrl(provider: string, pasted: string): string | null {
	const url = providerId("booking", provider, pasted);
	if (!url) return null;
	try { const u = new URL(url); if (u.protocol !== "https:") return null; return u.toString(); } catch { return null; }
}

/** The markup for an Instagram feed placed in a page, or null when none is set. */
export function instagramFeedHtml(provider: string, pasted: string): string | null {
	const id = esc(providerId("instagram", provider, pasted));
	if (!id) return null;
	if (provider === "Elfsight") return `<script src="https://static.elfsight.com/platform/platform.js" async></script><div class="elfsight-app-${id}" data-elfsight-app-lazy></div>`;
	if (provider === "Behold") return `<script type="module" src="https://w.behold.so/widget.js"></script><behold-widget feed-id="${id}"></behold-widget>`;
	return null;
}
