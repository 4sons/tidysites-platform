# Changelog

## 0.4.0

- The Tideworthy on-site editor: `@tideworthy/tidysites-platform/editor` is an Astro component a template renders in edit mode with the page's block schemas and block list. Every framed block (`data-tidy-block`, `data-tidy-type`, list in `data-tidy-blocks`) gets a hover chip with Edit, move up, move down, add a section below, and remove; Edit opens a side panel whose form comes from the block's Block Kit field schema (text, multiline, number, toggle, select, repeater). Saves go through EmDash's `PUT /_emdash/api/content/:collection/:id` as a draft with the editor's session; Publish is EmDash's publish call. Exists because EmDash's inline editor renders custom blocks as "edit in admin" placeholders. Pure block operations in `@tideworthy/tidysites-platform/editor/ops`.

## 0.3.0

- `tidyPlatform()` registers a middleware: with a `TIDY_FRAME_ANCESTORS` variable on the site (space-separated https origins), responses carry `Content-Security-Policy: frame-ancestors 'self' <origins>` in place of EmDash's `X-Frame-Options: SAMEORIGIN`, so the platform can embed the staging preview. Inert without the variable. New export `@tideworthy/tidysites-platform/middleware`.

## 0.2.1

- Fix: `POST /_tidy/fill` failed every upsert with "internal error" because the content-only seed document carried a numeric version; the seed format's version is the string "1". The document is now validated before it is applied, so a shape problem answers 400 with the validator's paths. 0.2.0's fill route is unusable for writes; removals worked.

## 0.2.0

- New route `POST /_tidy/fill`: real content over the template's sample content. Settings, entries upserted by slug with field-level merge over the existing entry, `$ref` and `$media` resolved as in a seed, and a `remove` list for sample entries the fill did not replace. Client gains `fill()`.

## 0.1.7

- Bootstrap applies the seed with the site's configured storage, so `$media` references in a template seed are downloaded into the site's media library. Before this every seed photo was skipped with "no storage configured". The storage comes from EmDash's `virtual:emdash/config` and `virtual:emdash/storage` modules, the same way the setup wizard builds it.

## 0.1.6

- First version on npm as `@tideworthy/tidysites-platform` (the npm scope is the parent brand; the name says which product it serves). Lockfile regenerated from a clean state so `npm ci` works on Linux runners. 0.1.3, 0.1.4, and 0.1.5 were release attempts that never reached npm; do not use them.

## 0.1.2

- Release workflow publishes on version tags with provenance. Never reached npm (no scope yet).

## 0.1.1

- Fix: the routes read the worker env from `cloudflare:workers` only. 0.1.0 touched `locals.runtime.env` first, which the Cloudflare adapter for Astro 6+ removed with a throwing getter, so every gated route failed on Astro 7. Not usable; use 0.1.1.

## 0.1.0

First release. Replaces the routes and plugin that lived inline in `template-home-services`.

- Astro integration `tidyPlatform()` injecting `/_tidy/bootstrap`, `/_tidy/session`, `/_tidy/session/claim`, `/_tidy/health`, `/_tidy/rotate-token`, `/_tidy/maintenance` as server routes. The routes reach the database through `getDb()`, so the old worker-level `/_tidy/*` rewrite and edit-mode cookie trick are gone.
- EmDash plugin descriptor `tidyPlatformPlugin()` and `createPlugin()` with `content:afterPublish`, `content:afterUnpublish`, `content:afterDelete` hooks (`errorPolicy: "continue"`, 8 s timeout) that post `{ reason, collection, id }` to the control plane over the `PLATFORM` binding.
- One-time sign-in links: mint with the site secret, claim from a browser, single use, 30 to 600 s lifetime, local redirects only.
- Token rotation by email or by token name; health with migration status.
- `@tideworthy/tidysites-platform/client`: a typed caller for all routes.
