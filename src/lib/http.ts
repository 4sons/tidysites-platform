export class HttpError extends Error {
	constructor(
		public status: number,
		message: string,
		public details?: unknown
	) {
		super(message);
	}
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
	});
}

export function errorResponse(err: unknown): Response {
	if (err instanceof HttpError) {
		return json({ ok: false, error: err.message, ...(err.details !== undefined ? { details: err.details } : {}) }, err.status);
	}
	console.error("[tidy-platform]", err);
	return json({ ok: false, error: "internal error" }, 500);
}

export async function readJson<T>(request: Request): Promise<T> {
	const text = await request.text();
	if (!text.trim()) return {} as T;
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new HttpError(400, "body must be a JSON object");
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new HttpError(400, "body must be a JSON object");
	return parsed as T;
}

/**
 * A redirect target we will send a browser to after sign-in. Only a local
 * absolute path is allowed: no scheme, no protocol-relative `//host`, no
 * backslash tricks, no control characters.
 */
export function isSafeLocalPath(value: unknown): value is string {
	if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
	if (!value.startsWith("/")) return false;
	if (value.startsWith("//") || value.startsWith("/\\")) return false;
	for (let i = 0; i < value.length; i++) {
		const c = value.charCodeAt(i);
		if (c < 0x20 || c === 0x7f) return false;
	}
	try {
		const u = new URL(value, "https://placeholder.invalid");
		return u.origin === "https://placeholder.invalid" && u.pathname.startsWith("/");
	} catch {
		return false;
	}
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isEmail(value: unknown): value is string {
	return typeof value === "string" && value.length <= 254 && EMAIL.test(value);
}

export function isHttpUrl(value: unknown): value is string {
	if (typeof value !== "string") return false;
	try {
		const u = new URL(value);
		return u.protocol === "https:" || u.protocol === "http:";
	} catch {
		return false;
	}
}

export function randomToken(bytes = 32): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	let s = "";
	for (const b of buf) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
