/**
 * Which check a form asks of a visitor, carried from the rendered page to
 * the lead route in a way a scraper cannot change. Every form keeps the
 * hidden trap field; a form can add Turnstile. The live site is a static
 * snapshot with no database, so the lead route cannot look the form up:
 * the page carries the form's choice as a signed token, keyed with the
 * Turnstile secret both deployments hold. Without a valid token the route
 * behaves as before this choice existed (a token required when the secret
 * is bound), so pages published earlier keep working.
 */

export type BotCheck = "trap" | "turnstile";

const enc = new TextEncoder();

async function hmac(secret: string, text: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
	return Array.from(sig.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The token a form prints in its hidden `bot_check` field. */
export async function signBotCheck(secret: string, form: string, check: BotCheck): Promise<string> {
	return `${check}.${await hmac(secret, `${check}|${form.trim().toLowerCase()}`)}`;
}

/** The check the token names for this form, or null when it is missing or was not signed with this secret. */
export async function readBotCheck(secret: string, token: string | undefined, form: string): Promise<BotCheck | null> {
	const m = /^(trap|turnstile)\.([0-9a-f]{32})$/.exec(token ?? "");
	if (!m) return null;
	const want = await hmac(secret, `${m[1]}|${form.trim().toLowerCase()}`);
	return want === m[2] ? (m[1] as BotCheck) : null;
}

/** The form record's or section's setting as a check: "Turnstile" turns it on, anything else is the trap field alone. */
export const botCheckOf = (setting: unknown): BotCheck => (String(setting ?? "").trim().toLowerCase() === "turnstile" ? "turnstile" : "trap");
