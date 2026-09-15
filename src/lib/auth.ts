/**
 * Bearer-secret gate for every /_tidy/* route.
 *
 * Two outcomes matter for security:
 * - No secret bound on the worker (an exported site, or a misconfigured one):
 *   every platform route answers 404, so the site shows no trace of the platform.
 * - Secret bound but the request does not carry it: 401.
 * The comparison is constant-time so response timing does not leak the secret.
 */

export const SECRET_BINDING = "TIDY_PLATFORM_SECRET";

export function bearerToken(request: Request): string | null {
	const header = request.headers.get("authorization") ?? "";
	if (!/^Bearer\s+/i.test(header)) return null;
	const token = header.replace(/^Bearer\s+/i, "").trim();
	return token.length > 0 ? token : null;
}

/** Constant-time string equality. Never early-returns on the first mismatching byte. */
export function secretMatches(provided: string | null | undefined, expected: string | null | undefined): boolean {
	if (!provided || !expected) return false;
	const enc = new TextEncoder();
	const a = enc.encode(provided);
	const b = enc.encode(expected);
	let diff = a.length ^ b.length;
	for (let i = 0; i < b.length; i++) diff |= (a[i % a.length] ?? 0) ^ (b[i] ?? 0);
	return diff === 0;
}

export type Gate = { ok: true } | { ok: false; response: Response };

export function readSecret(env: Record<string, unknown> | undefined): string | null {
	const v = env?.[SECRET_BINDING];
	return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Gate a platform route. `requireBearer: false` is for the one route a browser
 * reaches (the session claim); it still disappears when no secret is bound.
 */
export function gate(request: Request, env: Record<string, unknown> | undefined, requireBearer = true): Gate {
	const secret = readSecret(env);
	if (!secret) return { ok: false, response: new Response("Not found", { status: 404 }) };
	if (!requireBearer) return { ok: true };
	if (!secretMatches(bearerToken(request), secret)) {
		return { ok: false, response: new Response("Unauthorized", { status: 401, headers: { "www-authenticate": "Bearer" } }) };
	}
	return { ok: true };
}
