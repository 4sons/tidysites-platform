/**
 * GET /_tidy/edit?on=1|0&to=/path: switch on-site editing on or off for the
 * signed-in editor and go back to the page. No bearer: the browser calls it
 * from the editor's pill. Anyone without a session is sent back unchanged.
 */
import type { APIRoute } from "astro";
import { isSafeLocalPath } from "../lib/http";
import { methodNotAllowed } from "./_shared";

export const prerender = false;

const EDIT_COOKIE = "emdash-edit-mode";

export const GET: APIRoute = async (context) => {
	const to = context.url.searchParams.get("to");
	const back = isSafeLocalPath(to) ? to : "/";
	const headers = { location: back, "cache-control": "no-store" };
	const user = context.session ? await context.session.get("user") : null;
	if (!user) return new Response(null, { status: 303, headers });
	const secure = context.url.protocol === "https:";
	if (context.url.searchParams.get("on") === "1") context.cookies.set(EDIT_COOKIE, "true", { path: "/", sameSite: "lax", secure });
	else context.cookies.delete(EDIT_COOKIE, { path: "/" });
	return new Response(null, { status: 303, headers });
};

export const ALL = methodNotAllowed("GET");
