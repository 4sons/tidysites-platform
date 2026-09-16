/**
 * Framing policy. EmDash's middleware sets `X-Frame-Options: SAMEORIGIN` on
 * every response that has no Content-Security-Policy, which keeps the
 * platform's website page from embedding the staging preview. When the site
 * carries a TIDY_FRAME_ANCESTORS variable (space-separated origins), responses
 * get a `frame-ancestors` policy naming them instead. Nothing changes without
 * the variable.
 */
const ORIGIN = /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i;

/** The origins allowed to frame the site, from the variable's value; invalid entries are dropped. */
export function frameAncestors(value: unknown): string[] {
	if (typeof value !== "string") return [];
	return [...new Set(value.split(/[\s,]+/).map((s) => s.trim()).filter((s) => ORIGIN.test(s)))];
}

/** Apply the policy to a response's headers. Returns true when something changed. */
export function applyFramePolicy(headers: Headers, ancestors: string[]): boolean {
	if (ancestors.length === 0) return false;
	const existing = headers.get("Content-Security-Policy");
	if (existing && /frame-ancestors/i.test(existing)) return false;
	const directive = `frame-ancestors 'self' ${ancestors.join(" ")}`;
	headers.set("Content-Security-Policy", existing ? `${existing.replace(/;?\s*$/, "")}; ${directive}` : directive);
	headers.delete("X-Frame-Options");
	return true;
}
