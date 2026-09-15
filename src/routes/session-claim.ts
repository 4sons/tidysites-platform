/**
 * GET /_tidy/session/claim?t=…: the browser lands here from a minted link.
 * Signs the EmDash user in (Astro session, exactly as EmDash's own login
 * does), sets or clears edit mode, and redirects to the requested local path.
 */
import { claimSession } from "../lib/handlers";
import { HttpError } from "../lib/http";
import { methodNotAllowed, platformRoute } from "./_shared";

export const prerender = false;

const EDIT_COOKIE = "emdash-edit-mode";

function expiredPage(): Response {
	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Link expired</title><meta name="robots" content="noindex"></head><body style="font-family:system-ui,sans-serif;margin:3rem auto;max-width:32rem;padding:0 1rem"><p>This sign-in link has expired or was already used.</p></body></html>`;
	return new Response(html, { status: 410, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export const GET = platformRoute(
	async (context, deps) => {
		const result = await claimSession(context.url.searchParams.get("t"), deps);
		if (result.kind !== "redirect") return expiredPage();
		if (!context.session) throw new HttpError(500, "sessions are not configured on this site");
		context.session.set("user", { id: result.userId });
		const secure = context.url.protocol === "https:";
		if (result.editMode) context.cookies.set(EDIT_COOKIE, "true", { path: "/", sameSite: "lax", secure });
		else context.cookies.delete(EDIT_COOKIE, { path: "/" });
		return new Response(null, { status: 303, headers: { location: result.redirect, "cache-control": "no-store" } });
	},
	{ requireBearer: false }
);

export const ALL = methodNotAllowed("GET");
