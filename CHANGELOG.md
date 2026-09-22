# Changelog

## 0.7.1

- Editor: the class the bar puts on `<html>` is `tidy-has-bar`. 0.7.0 used `tidy-bar`, the bar's own class, so the bar's fixed styles applied to the document and pushed the top of the page off screen for a signed-in editor.

## 0.7.0

- Editor: the corner pill is a bar across the top of the page. "Staging" (the `label` prop) on the left; Edit on the right while editing is off; Business details, Publish (with the count, only while something is unpublished) and Done while it is on. The bar sets `--tidy-bar` on `<html>` so a template's sticky header can sit below it.
- Editor: editing is a page edit. Inside the sections a click edits the block or record it lands on and never follows a link; a click on the header or footer (outside the menu) opens Business details.
- Editor: section and record outlines show only while editing. They used to show on hover for every visitor, live site included.

## 0.6.1

- Editor: EmDash's toolbar is hidden while editing is off, so the Edit pill is the one control on the page. It still shows on article pages in edit mode, where EmDash's inline editing needs it.

## 0.6.0

- `GET /_tidy/edit?on=1|0&to=/path`: switches on-site editing on or off for the signed-in editor (the `emdash-edit-mode` cookie) and returns to the page. No bearer; a visitor without a session is sent back unchanged.
- Editor: mounts itself. The layout renders `<TidyEditor>` on every page; it shows nothing to a visitor, an "Edit" pill to a signed-in editor, and the editor once editing is on. A page without blocks gets the pill only (EmDash's inline editing handles its prose). The pill gains "Done". Every prop is optional now; EmDash's toolbar is hidden only while this editor runs (`html.tidy-editing`).

## 0.5.1

- Editor: a record region nested inside a section (a service card in the services grid) gets its own "Edit details" chip; clicking it edits the record instead of following the card's link, and leaving it hands the chip back to the section.

## 0.5.0

- Editor: image picker over the site's media library with upload, for block fields whose id names an image URL (`imageUrl`, `photoUrl`, …) and for record fields of kind image.
- Editor: record details. A `[data-tidy-record]` region (with `data-tidy-record-id` and `data-tidy-record-label`) gets an "Edit details" chip; the business record is always reachable from the pill. Forms come from EmDash's manifest (string, text, richText, number, boolean, select, image). Record saves publish at once, since other pages read the published version.
- Editor: Publish publishes every entry saved in this browser session (pending list in sessionStorage); the pill shows the count.
- Editor: EmDash's toolbar is hidden and `data-emdash-ref` attributes are removed on block pages, so one editor owns the page. Article pages, which do not mount this editor, keep EmDash's inline editing.

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
