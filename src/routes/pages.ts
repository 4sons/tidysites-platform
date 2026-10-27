/**
 * GET /_tidy/pages: every address the site renders, from its own data: the
 * home page, the pages, each listing that is on, the blog and its facets, and
 * every record whose page is on, at the site's own URL patterns. The publish
 * plans from this list, the sitemap is written from it, and the platform's
 * pages tool shows it.
 */
import { sitePages } from "../sections/lib";
import { json } from "../lib/http";
import { methodNotAllowed, platformRoute } from "./_shared";

export const prerender = false;

export const GET = platformRoute(async () => json({ ok: true, pages: await sitePages() }));

export const ALL = methodNotAllowed("GET");
