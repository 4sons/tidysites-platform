# Changelog

## 0.20.1

- The form's "Something went wrong" line follows the site's wording: the label is printed on the form and the browser script reads it there, instead of calling the server-side lookup it could not reach.
- Themes (keel, porcelain) print the Business record's custom CSS and a page's own CSS at the top of the body, after the theme stylesheet, so a site's own rule has the last word.

## 0.20.0

What a port kept running into.

- **Pages under a parent.** A page names its parent by slug (`parent`); its address is the parent's address plus its own (`/service-area/livonia`), up to four levels, and the breadcrumb and structured data follow. A page with a parent answers only at that address.
- **Rich copy on sections.** Every section with a Text field gains `copy`, rich text (links, lists, bold) shown instead of the plain text when set; the connector sends markdown for it as it does for a record's content.
- **File uploads on forms.** A question of kind "file upload" takes a document or photo (10 MB); the file is kept in the site's bucket under leads/, the lead names it, and `GET /_tidy/lead-file?key=` serves it to the platform.
- **A second Tag Manager container** (`gtm_id_2` on the integrations record) and **CallTrackingMetrics** as a call tracking provider (by account id, or the swap script pasted).

## 0.19.1

- Labels the first pass missed go through the wording too: the call bar's "Call" and "Call or text", "Address", the built-in form's labels and its error line, "Read them all".

## 0.19.0

Any word on the site can be changed: the fixed labels too.

- The frame record's `wording` lines (`Original => Replacement`) reword a fixed label everywhere a theme prints it: "Call or text", "Hours", "Read them all", a form's "Name", the footer's "Privacy". The original is the key, so a theme change never loses the site's words. `wording(request)` from `sections/lib` gives a component the lookup; every package label goes through it and is listed in `strings` (`PACKAGE_STRINGS`).
- The hero's "photo with headline over" layout shows its stored photo (it read a plain URL only, so a library image never appeared).
- `GET /_tidy/strings`: the catalog with the site's overrides, the package's labels plus the theme's own (`tidyPlatform({ strings })` in astro.config). The platform's search lists these beside the records and a replace writes the line.

## 0.18.1

- A `schema` or `site_schema` override the CMS stored as a parsed value (JSON written into the text field) is read as written; only text was read before, so the override never rendered.

## 0.18.0

A page owns its SEO; the record stays data.

- Every collection with a URL pattern carries the same group: `meta_title`, `meta_description`, `share_image`, `social_title`, `social_description`, `canonical`, `noindex`, `schema`. Each is empty by default and empty means derived from the record (title, summary, its own picture, its own address, its type); a set field replaces the derived value for that page.
- Structured data on every page: the business (type from `schema_type` on the Business record, address unless hidden, logo, socials, `price_range`, founding year, map, hours from the primary location) and one entry per other location; the frame record's `site_schema` replaces it. Per page: the breadcrumb trail, the record's entry (Service, Person, BlogPosting, Product) and FAQPage from the page's FAQ sections; the page's `schema` replaces those.
- `sections/lib` gains `pageHead()` for a theme's layout and `sitePages()` marks `noindex` pages, which the publish leaves out of the sitemap. `seo` exports the pure side.

## 0.17.0

Records are data; pages are where the site says they are.

- Every page-bearing collection carries EmDash's own URL pattern (`/services/{slug}`, `/service-areas/{slug}`, `/team/{slug}`, `/for/{slug}`, `/blog/{slug}`, pages at `/{slug}`), set by the template on a new site and changed on the site itself afterwards (the admin's collection settings): a port can put locations at `/locations/{slug}` or at the root. A structure apply never overwrites a pattern the site already has.
- A record's own page is a switch: `page` (on unless off) on services, service areas, audiences, conditions, products and case studies; `has_profile` on people and `has_page` on technologies as before. A record whose page is off is still data for every section that lists it, with no link, no address and no sitemap line.
- The listing page at a pattern's prefix is a switch on the frame record (`services_index`, `areas_index`, `team_index`, `audiences_index`, `conditions_index`, `products_index`, `technologies_index`, `case_studies_index`; on unless off). A page record at the same slug takes the address instead.
- `sections/lib` gains the runtime side: `sitePatterns()`, `entryUrl()`, `collectionUrl()`, `blogBase()`, `resolveRoute()` and `sitePages()`; `routes-lib` has the pure part (`PAGE_TYPES`, `routeCandidates`, pattern maths). Every section and the footer build links through them. A theme renders everything from one catch-all route.
- `GET /_tidy/pages`: every address the site renders, from its own data. The publish plans and writes the sitemap from it.
- `production`: `productionFetch()` for a theme's live worker, answering 410 and 451 for the addresses the site's redirects mark gone (`_gone.json`, written by the publish) beside the API and the not-found page. Redirects themselves are EmDash's own (`/_emdash/api/redirects`, the admin's Redirects screen, the automatic one on a slug change).

## 0.15.0

Custom rows: your own markup as part of the page, with nothing able to run.

- The `rows` collection (a name, HTML, CSS) and the `row` section: a saved row by name, or HTML and CSS written in the section, rendered in the page itself through the sanitizer (`sanitize`: script, event handlers, javascript links, styles in the markup and frames to unknown hosts are dropped; the CSS is scoped to the row and stripped of imports and remote fetches) with the site's tokens around it. The sandboxed frame section is still there as "Embed (sandboxed)" for the calculator or embed that needs script.
- A page chooses its header and footer: the site's, none, or a named custom row (`pageFrame()` for a theme's layout). The `frame` record can replace the site's header or footer everywhere with a row; `frame/header` and `frame/footer` render it.

## 0.14.0

What a second survey of client sites showed the template forcing into sections, now data.

- `details`, the Business details section: name, address, phone, email, hours day by day (today marked), socials and the map, each on or off, as a row, a card or two columns, from the Business record or a named location. The footer renders the per-day hours table when a location has one.
- Cards: the feature section is called Cards in the editor, takes 2, 3 or 4 per row, and each card may carry an image and a link. The free-form row of N things.
- `audiences`, Who we serve: a collection for the people or industries a service is for (coaching for executives, bookkeeping for dentists), with its own pages at `/for/<slug>`, and a section that lists them as cards, chips or a list.
- Compare layouts: plans as a table (one column a plan, one row an inclusion, ticks where it is in) and products as a specs table.
- Galleries open in a lightbox (a switch on the section, on by default), and a gallery can be an Instagram feed (Elfsight or Behold, by id on Integrations).
- The pop-up: the `frame` record says what it shows (an offer or a form), when (on arrival, after ten or thirty seconds, after scrolling halfway, on leaving) and how often (once a visit, once a day, every time); the frame renders it in the dialog.
- Email-only forms: a form may ask for an email and nothing else, the lead route takes an email alone, and the CTA has a "band with email" layout.
- Accessibility widget (UserWay by id, accessiBe by switch) on Integrations, rendered by `frame/scripts`.

## 0.13.0

- `chrome/*` is `frame/*` (`frame/header`, `frame/footer`, `frame/dialog`, `frame/scripts`, `frame/frame.css`) and the wrapper class is `ts-frame`: the header, footer, dialog and call bar are the frame around a page.
- Third parties by id: live chat (Crisp, Tawk.to, Tidio, LiveChat, Podium), a reviews widget (Trustindex, Elfsight, Birdeye), a booking embed (Calendly, Pike13, Square Appointments, Acuity, Jobber) and the Meta and Google Ads pixels, each a provider and an id on the new one-record `integrations` collection, where the whole vendor embed may be pasted and the id is read out of it. `lib/providers` reads ids and renders the package's fixed snippets; `frame/scripts` places them. No free script field, by design (README, "Third parties").
- The booking button can open the booking embed in the dialog; the new one-record `frame` collection carries the line above the header and the call bar at the bottom of small screens (call and book, call only, book only, off).
- The column cap: D1 allows a table 100 columns and EmDash gives every field one. Business stays at 72 fields, a test refuses any collection over 75, and a new group of settings gets its own one-record collection.
- Carousel layouts on reviews, team, services, brands, clients and gallery; tabs and two-column layouts on the FAQ; a "provider widget" layout on reviews.

## 0.12.0

The look, the chrome and the forms come from data.

- Tokens: the Business record carries page background, card colour, text colour, corner style, spacing, type size and content width beside the brand colours and fonts; `brandTokens()` and `brandStyle()` set them on `<html>` and the default sections read them with fallbacks (README, "Tokens").
- The chrome: `chrome/header`, `chrome/footer` and `chrome/dialog`, with the class contract every theme styles. The header renders nested menu items as dropdowns or a mega panel, the phone, the portal button (`portal_label`) and the booking button, which opens a form in the dialog when `booking_opens` says so (README, "The chrome and its classes").
- Forms as records: the `forms` collection, `sections/form` to render one anywhere by name, the `form` section, a Form field on the hero, contact and CTA sections, and `lead` (`handleLead`) as the one `/api/lead` route for staging and the live site, forwarding every answer under its question's label (README, "Forms").
- `POST /_tidy/schema` applies only the structure items that changed since the last apply (each block type, collection and the relations is hashed and remembered in the `tidy:structure` option), one at a time within `budgetMs` (25 seconds by default), and answers `complete: false` when some are left for the next call; `force=1` applies everything. Before this a deploy that changed nothing structural re-applied 322 fields one query at a time and took minutes.

## 0.11.3

- `refId()` and `refersTo()` in `sections/lib`: a reference field stores the entry's internal id, not its slug, and the services default now groups by category with that. Before this a category never matched its services.

## 0.11.2

- Portrait and square photo slots crop from the top of the image, so a headshot in a shorter frame keeps the face and loses the shoulders, never the other way round.

## 0.11.1

- `mediaUrl()` in `sections/lib`: a plain URL for an image field from the stored value (its storage key), for avatars and logos; the defaults and the business logo use it. Before this, a stored image with no `src` rendered as an empty circle.
- The photo slot (`sections/photo`) styles itself anywhere on a page, not only inside package sections, so a theme's own section can place it without a band of empty space.

## 0.11.0

The package carries the template.

- `@tideworthy/tidysites-platform/template`: the one data shape every theme renders (24 collections, 35 section types, menus), typed, with `mergeStructure()`; `template/structure.json` is the source and `template/README.md` the rules and the evidence.
- `npx tidysites-seed [seed.json] [--check]`: writes the template's structure into a theme's seed and keeps its menus, settings and content; refuses a seed whose section values use fields their block type does not declare.
- `@tideworthy/tidysites-platform/sections`: the section dispatcher. A site's `src/custom/blocks/<type>.astro`, then the theme's `src/sections/<type>.astro` (or its `components` prop), then the package default. Every block framed for the on-site editor.
- `@tideworthy/tidysites-platform/sections/defaults/<type>.astro`: a plain default rendering of every section type, driven by the brand tokens; `sections/lib` has the helpers and the normalized business record; `sections/photo` the photo slot.

## 0.10.14

- Editor bar: Edit, Done and Sign in to edit show a spinner and what they are doing until the page comes back.

## 0.10.13

- Editor: the request panel opens at once; who is signed in is read when the page loads and the greeting fills in. The middleware keeps only the noindex header; robots.txt and the sitemap for staging are the control plane's.

## 0.10.12

- The staging site is never indexed: every response carries `X-Robots-Tag: noindex, nofollow`, robots.txt disallows everything and the sitemap answers 404. The publish crawl still gets the real robots.txt and sitemap for the live copy.

## 0.10.11

- Editor bar: Request a change comes first and carries the blue; Edit follows it plain.

## 0.10.10

- Editor: the bar reads Edit, Request a change, Revisions, Publish live; Publish live is green.

## 0.10.9

- Editor: the request panel greets the person by name and speaks plainly; the floating button is a pen, not a chat bubble. `GET /_tidy/change` says who is signed in.

## 0.10.8

- Editor: Request a change, from the bar and a floating button at the corner. A panel takes what to change and which page (the current one by default) and hands it to the platform through the control plane (`POST /_tidy/change`); it shows up under Changes.

## 0.10.7

- Editor: Publish live, Restore and Remove section confirm in a dialog of the editor's own, never the browser's box. The bar's note reads "A private copy to see working changes on the website, not publicly accessible."

## 0.10.5, 0.10.6

- Editor bar: interim notes.

## 0.10.4

- Editor: the bar has a 1px white bottom edge, so it stands off a dark header as well as a light one.

## 0.10.3

- Editor: one bar on the staging site for everyone. A visitor gets Sign in to edit, which goes through the platform's door for the site (`<control>/sites/<id>/sign-in?back=`) and comes back signed in; a signed-in editor gets Edit and the controls as before. The bar is taller, named "Staging website" with an amber edge and a line on what staging is. The publish crawl never sees it.

## 0.10.2

- Editor: the Revisions list starts after the newest publish, which is what is live now and has nothing to view or restore; a deep link to it opens the list. Inside the revision viewer EmDash's pill is hidden along with the bar.

## 0.9.1

- Editor: one editor on the site. An article page (a post, a service area, a page with the article layout) gets the bar too, with Publish from the entry's draft state, Business details and Done, over EmDash's inline prose editing; EmDash's own pill is hidden under the bar everywhere. Inside sections and record regions this editor owns the fields and EmDash's inline editor does not mount; outside them (article prose) it keeps working.

## 0.9.0

- Editor: sections are an EmDash `blocks` field (`sections` by default), and the forms come from the seed's block type definitions (`slug`, `type`, `validation.options`, `subFields`) instead of Block Kit shapes. Fields render by EmDash type: string, text, url, number, integer, boolean, datetime, select, multiSelect, image (the media picker, storing EmDash's media value) and repeater; Portable Text and file fields say "edit in the admin". New blocks carry no `_version` so EmDash stamps the active one; a saved block keeps its `_type`, `_key` and `_version`, and fields the form read as empty are left out rather than written as null.
- Editor: Publish reads the page's draft state from EmDash (`compare`), so a draft an agent staged over the API is publishable from the page; the count no longer depends on this browser's session.
- `POST /_tidy/schema`: applies the template seed's block types, collections, fields and relations to a bootstrapped site (`onConflict: "update"`, no content, settings or menus). How a template schema change reaches a site provisioned before it. Refuses before bootstrap (409).

## 0.8.0

- EmDash 1.0: the peer range is `>=1.0.0 <2.0.0` for `emdash` and `@emdash-cms/auth` (was 0.37 only). Nothing in the package changed: every export it depends on (`emdash/runtime` `getDb`, `emdash/seed` `loadSeed`, `emdash/middleware` `runScheduledTasks`, the repositories, `applySeed`, the auth token helpers) is still public in 1.0.1; only the `emdash/middleware/*` and `emdash/db/*-migrations` subpaths moved under `emdash/internal/*`, and this package never used them. Proven on a 0.37 database: the 1.0.1 runtime applied its 15 migrations on the first request (73 to 88), pages, sessions, editing, fill, maintenance and the content API all answered as before.

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
