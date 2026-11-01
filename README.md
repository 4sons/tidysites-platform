# @tideworthy/tidysites-platform

The Tidysites platform integration for [EmDash](https://emdash.dev) sites on Astro. It adds a small set of platform routes under `/_tidy/*` and an EmDash plugin whose publish hooks tell the platform to ship the site live.

It is the only code in a Tidysites template that knows about the platform, and it does nothing when the platform's secret is not bound to the worker. A site exported from the platform keeps this package installed and runs unchanged.

## Install

```sh
npm install @tideworthy/tidysites-platform
```

Peer dependencies: `astro` 7, `emdash` and `@emdash-cms/auth` 1.x, `kysely`. Published on npm as `@tideworthy/tidysites-platform`; GitHub tags `vX.Y.Z` match each version.

## The template and the sections

Since 0.11.0 the package carries the Tidysites template: the collections, fields, section types and menus every theme renders (`template/README.md` has the rules). A theme installs the package, writes the template's structure into its seed with `npx tidysites-seed`, renders pages with `@tideworthy/tidysites-platform/sections`, and overrides the section types it has an opinion about in `src/sections/<type>.astro`. Everything else renders with the package default, so a section an owner adds later still shows up.

```astro
---
import Sections from "@tideworthy/tidysites-platform/sections";
import { sectionTypes } from "@tideworthy/tidysites-platform/template";
---
<Sections value={page.data.sections} />
<TidyEditor blocks={sectionTypes} ... />
```

## Wire it up

```js
// astro.config.mjs
import emdash from "emdash/astro";
import { tidyPlatform, tidyPlatformPlugin } from "@tideworthy/tidysites-platform";

export default defineConfig({
	integrations: [
		tidyPlatform(),
		emdash({
			// database, storage, ...
			plugins: [tidyPlatformPlugin()]
		})
	]
});
```

`tidyPlatform()` is an Astro integration that injects the routes below as server routes. `tidyPlatformPlugin()` is the EmDash plugin descriptor that registers the publish hooks. Both are needed.

The worker entry stays EmDash's own:

```ts
// src/worker.ts
export { default, PluginBridge } from "@emdash-cms/cloudflare/worker";
```

## Tokens

The Business record sets the brand on `<html>` through `brandStyle(business)` (from `sections/lib`), and every package section, the frame and a theme's own stylesheet read the same tokens with fallbacks, so a site changes its look in the admin and a theme never invents a second set.

| Token | From the Business record | Set when |
|---|---|---|
| `--brand-primary`, `--brand-primary-ink` | Brand colour, and the text colour that reads on it | always |
| `--brand-accent`, `--brand-accent-ink` | Accent colour | always |
| `--brand-font-display`, `--brand-font-body` | Display and body fonts | always |
| `--brand-radius` | Corner style: sharp, soft, rounded, pill | when chosen |
| `--brand-space` | Spacing: compact, regular, airy (the vertical rhythm between sections) | when chosen |
| `--brand-type` | Type size: compact, regular, large (a multiplier on headings and ledes) | when chosen |
| `--brand-max` | Content width: narrow, regular, wide | when chosen |
| `--brand-ground`, `--brand-surface` | Page background and card colour | when the record has them |
| `--brand-ink`, `--brand-ink-2`, `--brand-ink-3`, `--brand-line` | Text colour, and the two quieter inks and the line colour derived from it | when the record has a text colour |

One rule sits under all of this: D1 allows a table 100 columns and EmDash gives every field one, so the Business collection stays under 75 fields (a test holds the line) and a new group of settings gets its own one-record collection, as `frame` and `integrations` have. A theme's `tokens.css` maps its own names onto these (`--ground: var(--brand-ground, #f6f7f7)`), so a site that leaves a field empty gets the theme's voice and one that fills it gets its own. `custom_css` on the Business record is the last word.

## The frame and its classes

`@tideworthy/tidysites-platform/frame/header`, `frame/footer` and `frame/dialog` are the header, footer and modal every theme starts from. They render the primary menu with its children (a dropdown, or a mega panel when children carry a description in the admin's "title" box), the phone, the portal button and the booking button, which opens the booking form in the dialog when the Business record says "a form on this site". A theme uses them as they are and restyles the classes, or renders its own markup with the same class names. Either way the names are the contract, so a site's custom CSS written on one theme carries to the next.

```astro
---
import Header from "@tideworthy/tidysites-platform/frame/header";
import Footer from "@tideworthy/tidysites-platform/frame/footer";
import Scripts from "@tideworthy/tidysites-platform/frame/scripts";
---
<head>…<Scripts business={business} where="head" /></head>
<Header business={business} menu={menu} siteTitle={siteTitle} isCurrent={isCurrent} />
<main><slot /></main>
<Footer business={business} footerMenu={footerMenu} siteTitle={siteTitle} />
<Scripts business={business} />
```

| Area | Classes |
|---|---|
| Header | `ts-header` (`ts-header-sticky`), `ts-header-wrap`, `ts-brand`, `ts-brand-logo`, `ts-brand-mark`, `ts-brand-name`, `ts-topbar`, `ts-topbar-wrap`, `ts-topbar-link` |
| Menu | `ts-nav`, `ts-nav-list`, `ts-nav-item` (`ts-nav-has-children`, `ts-nav-has-mega`, `ts-nav-open`), `ts-nav-link`, `ts-nav-caret`, `ts-nav-panel` (`ts-nav-mega`), `ts-nav-sub-list`, `ts-nav-sub-item`, `ts-nav-sub-link`, `ts-nav-sub-label`, `ts-nav-sub-desc`, `ts-nav-sub-sub`, `ts-nav-sub-sub-link` |
| Actions | `ts-header-actions`, `ts-header-phone`, `ts-header-portal`, `ts-header-book`, `ts-menu-btn` |
| Mobile menu | `ts-mobile-menu`, `ts-mobile-list`, `ts-mobile-item`, `ts-mobile-link`, `ts-mobile-fold` (an item with children: a `<details>` whose `ts-mobile-fold-head` holds the link and the `ts-mobile-fold-toggle`), `ts-mobile-sub`, `ts-mobile-sub-link`, `ts-mobile-actions` |
| Footer | `ts-footer`, `ts-footer-wrap`, `ts-footer-brand`, `ts-footer-tagline`, `ts-footer-social`, `ts-footer-social-link`, `ts-footer-col`, `ts-footer-visit`, `ts-footer-heading`, `ts-footer-list`, `ts-footer-hours`, `ts-footer-legal` |
| Call bar | `ts-callbar`, `ts-callbar-call`, `ts-callbar-book` (small screens only) |
| Dialog | `ts-dialog` (`ts-dialog-embed`, `ts-booking-embed`), `ts-dialog-box`, `ts-dialog-title`, `ts-dialog-close`, `ts-dialog-body`; any element with `data-tidy-dialog="<id>"` opens the dialog with that id |
| Buttons | `ts-btn`, `ts-btn-accent`, `ts-btn-outline`, `ts-btn-lg` |
| Sections | `ts`, `ts-wrap`, `ts-head`, `ts-eyebrow`, `ts-lede`, `ts-grid`, `ts-split`, `ts-card`, `ts-chip`, `ts-form` and the rest of `sections/defaults.css` |

A site's `src/custom/header.astro` still replaces the whole header when it must; the point of the contract is that it rarely must.

## Third parties

A site runs its live chat, reviews widget, booking embed and pixels by id, never by pasted code. The one-record `integrations` collection names the provider and holds the id, or the whole embed code the vendor handed over, from which `lib/providers` reads the id (`providerId`, `pixelId`); the frame renders the package's own fixed snippet for that provider with the id escaped (`frame/scripts`, placed once in `<head>` with `where="head"` and once before `</body>`). Nothing a person types becomes script, a provider not on the list has no door, and there is no free "paste your head code" field, on purpose: that would be arbitrary script into a client's live site for anyone holding an editor token or an agent that goes wrong. GTM and GA4 ids are the same shape and the same trust.

| Kind | Providers | Where it renders |
|---|---|---|
| Live chat | Crisp, Tawk.to, Tidio, LiveChat, Podium | end of body |
| Reviews widget | Trustindex, Elfsight, Birdeye | the reviews section's "provider widget" layout |
| Booking embed | Calendly, Pike13, Square Appointments, Acuity, Jobber | the booking dialog, when the booking button opens "the booking embed"; only a URL on the provider's own host |
| Pixels | Meta pixel, Google Ads tag, TikTok pixel, LinkedIn Insight | head (LinkedIn at the end of body); held until consent when the cookie banner is on |
| Analytics | Google Tag Manager container, or GA4 alone (the Business record's `gtm_id` / `ga4_id`) | head; held until consent when the cookie banner is on |
| Call tracking | CallRail, WhatConverts | end of body; runs regardless of consent, the site cannot swap numbers without it |
| Heatmaps and recordings | Hotjar, Microsoft Clarity | head; held until consent when the cookie banner is on |
| Instagram feed | Elfsight, Behold | the gallery section's "instagram feed" layout |
| Accessibility widget | UserWay (by account id), accessiBe (by switch) | end of body |
| Adobe Fonts | a Typekit kit id, or the pasted `<link>` | `frame/fonts`, beside the Google Fonts stylesheet |

Adding a provider is a pull request here: its id pattern, its embed pattern and its snippet, with a test.

### Cookie consent

The `frame` record's `cookie_banner` switch puts a consent bar on every page (`frame/consent`, placed before `frame/scripts` at the end of body; text, policy link and button labels on the same record). With it on, `frame/scripts` writes the trackers (pixels, GTM or GA4, heatmaps) as inert `<script type="text/plain" data-tidy-gated>` tags and the bar wakes them on Accept; the answer is kept in the visitor's browser for a year, and Decline leaves them inert. Chat, call tracking and the accessibility widget run either way. With the switch off, every snippet runs as before.

### Fonts

`frame/fonts` (placed once in `<head>`) emits the stylesheets the brand needs: Google Fonts for the Business record's named families (one stylesheet per family, weights 300 to 800, so a family Google does not have fails alone), the Adobe kit when `integrations.adobe_fonts_kit` is set, and `@font-face` rules for font files uploaded to the `frame` record (`display_font_file`, `body_font_file`, woff2). An uploaded file takes over its token (`--brand-font-display`, `--brand-font-body`) under the family names "Brand Display" and "Brand Body", so a theme that reads the tokens needs no change.

### Blog

`sections/lib` exports `blogPage({ page, category, tag, author, size })` and `blogFacets()`: posts carry a `category`, comma-separated `tags` and an `author` (a people record), and the frame record's `blog_page_size` pages the list. A theme renders `/blog`, `/blog/page/N`, `/blog/category/<slug>`, `/blog/tag/<slug>` and `/blog/author/<slug>` from these; the slugs are `slugify()` of the names, so no extra records exist for them.

### Languages

The `frame` record's `site_language` is the `<html lang>` default. A page in another language sets `language` and names the page it translates in `translation_of` (by title); `pageLanguages(business, page, origin)` returns the page's language and the `hreflang` alternates for every page in that group, with `x-default` on the untranslated one. A theme passes the page record into its layout and emits the links; nothing else changes, and a site with no translations emits none.

## Where records render as pages

A record is data first. A service, an area, a person or a product can be listed by any section anywhere on the site; whether it also has an address of its own is a switch on the record, and where that address is comes from the collection's URL pattern.

- **Patterns.** Each page-bearing collection carries EmDash's own URL pattern: `pages` at `/{slug}`, `services` at `/services/{slug}`, `service_categories` at `/services/category/{slug}`, `service_areas` at `/service-areas/{slug}`, `audiences` at `/for/{slug}`, `people` at `/team/{slug}`, `conditions`, `products`, `technologies` (`/technology/{slug}`), `case_studies` (`/case-studies/{slug}`) and `posts` at `/blog/{slug}`. The template sets them on a new site; after that the site's own value wins (the admin's collection settings, or `schema_update_collection` on the site's MCP), and a structure apply leaves it alone. A port that wants `/locations/{slug}`, or a location at the root (`/{slug}`), changes the pattern and nothing else.
- **A record's page.** `page` on services, service areas, audiences, conditions, products and case studies is on unless it says off. `has_profile` on people and `has_page` on technologies are off unless on. A record whose page is off renders in every section that lists it, without a link.
- **Addresses.** The frame record names where each collection lives: `blog_path` (`/news`), `services_path`, `areas_path`, `audiences_path`, `team_path`, `conditions_path`, `products_path`, `technologies_path`, `case_studies_path`, `service_categories_path`. A value becomes the pattern (`/news` is `/news/{slug}`) ahead of EmDash's collection setting, so a port or the CLI sets the old site's addresses on the frame record and nothing else.
- **Listings.** The listing at a pattern's prefix (`/services`, `/team`, `/service-areas`, ...) is on unless the frame record's switch for it (`services_index`, `team_index`, ...) says off. A page record at the same slug takes the address. The blog's listing and facets sit at the posts pattern's prefix and follow `blog_index`: on, off, or (left alone) on while the site has a post; off or empty, `/blog` is a 404 and out of the sitemap.
- **In a theme.** One catch-all route asks `resolveRoute(path)` from `sections/lib` what a path is (`home`, `page`, `index`, `blog` or `entry`, with the entry) and renders it; links come from `entryUrl(collection, entry)` (null when the record has no page), `collectionUrl(collection)` (null when the listing is off) and `blogBase()`. `sitePages()` lists every address the site renders; `GET /_tidy/pages` serves it to the publish, which plans the live snapshot and writes the sitemap from it.
- **Redirects** are EmDash's own: the admin's Redirects screen, `/_emdash/api/redirects`, and the automatic redirect EmDash writes when a published slug changes. The publish carries them to the live site; `productionFetch()` from `production` answers the ones marked gone (410, 451).

## Pages under a parent

A page names its parent by the parent's slug (`parent`). Its address is the parent's address plus its own slug, so `livonia` under `service-area` renders at `/service-area/livonia` (four levels at most); the breadcrumb and the structured data follow, `entryUrl`, `sitePages()` and `resolveRoute()` know the chain (`pageParents()`), and a page with a parent answers only at its nested address. Changing a parent moves every page under it; the redirect for the old address is the person's to add.

## Rich copy on sections

Every section with a Text field (`body`) also has `copy`, rich text: links in a paragraph, lists, bold. When `copy` is set the section shows it instead of the plain text (`rich()` from `sections/lib`, rendered with EmDash's PortableText), so a port keeps its in-copy links and the connector sends markdown for it the way it does for a record's content. A theme's own section component renders `copy` the same way.

## File uploads on forms

A form question of kind "file upload" takes one document or photo (PDF, Word, text, JPEG, PNG, GIF, WebP, HEIC; 10 MB). `handleLead` keeps it in the site's bucket (`MEDIA`) under `leads/<stamp>/<name>`, the lead's fields name the file under the question's label, `lead.files` lists each with its key, and `GET /_tidy/lead-file?key=` streams one back to the platform (keys under leads/ only). A file of another type or size is left out and the lead says so under "Files not accepted".

## Wording

Every fixed label a theme prints is a line a site can change. The frame record's `wording` field takes one line per change, `Original => Replacement` ("Call or text => Call us", "Read them all => See every review"); the original is the key, so the line survives a theme change and a package update. In a component: `const tx = await wording(Astro.request)` from `sections/lib`, then `{tx("Call or text")}` in the markup. Every label the package passes through it is listed in `strings` (`PACKAGE_STRINGS`); a theme lists its own and hands them to `tidyPlatform({ strings })` in astro.config, and `GET /_tidy/strings` serves the catalog with the site's overrides, so the platform's text search finds a label the way it finds content and a replace rewords it. Record content is never in the catalog: a record's words are edited on the record.

## Page SEO and structured data

Every collection with a URL pattern carries the same group of fields, and each one is empty by default: `meta_title`, `meta_description`, `share_image`, `social_title`, `social_description`, `canonical`, `noindex` and `schema`. Empty means derived from the record: the title tag from the record's title and the site's name, the description from its summary, the share image from the record's own picture (a service's featured image, a person's photo, a post's featured image, a page's first hero section) and then the logo, the canonical from the page's own address, and the structured data from the record's type. A set field replaces the derived value for that page only: a written meta title prints as written, `noindex` keeps the page out of search engines and out of the sitemap, `canonical` takes a path on the site or a full address, and `schema` (JSON-LD, one object or a list) replaces the page's own generated entries.

The structured data on every page is the business: its type from the Business record's `schema_type` (Dentist, Plumber, RoofingContractor; LocalBusiness when empty), name, phone, email, address (left off when `hide_address` is on), logo, socials, `price_range`, founding year, map and hours day by day from the primary location, plus one more entry per location at another address. The frame record's `site_schema` replaces that generated entry. Then the page's own entries: the breadcrumb trail, the record's entry (Service, Person, BlogPosting with its author and dates, Product), and FAQPage from the page's FAQ sections.

A theme's layout calls `pageHead(Astro.request, { collection, data, sections, path, origin, title, description, image, crumbs })` from `sections/lib` once and hands the result to the page context (`title`, `description`, `canonical`, `seo: { ogTitle, ogDescription, ogImage, robots }`) and the head (`jsonLdHtml`). The pure side is `seo` (`pageSeo`, `identityGraph`, `parseHours`). `sitePages()` marks a `noindex` page and the publish leaves it out of the sitemap.

## Responsive pictures

A stored image is served at 480, 800, 1200 and 1600 pixels wide through `/_tidy/img/<width>/<key>` (`routes/img`), resized with the worker's `IMAGES` binding and re-encoded as WebP, immutable. `lib/images` prints the `srcset` (`mediaSrcset(value)`) and a `sizes` hint (`sizesFor("half")`: full, half, third, quarter, icon); `sections/photo` and the Columns image slot use them, and every image custom HTML reads carries `srcset` (`<img src="{{ page.image.url }}" srcset="{{ page.image.srcset }}" sizes="100vw">`). SVG and GIF keep their original. The live worker serves the variants from the publish snapshot; the control plane's publish fetches `/_tidy/img/` like media files.

## Custom rows

A custom row is HTML and CSS a person or an agent wrote, rendered as part of the page: a saved row from the `rows` collection placed by name, or markup written straight into a `row` section. Nothing in a row can run. The sanitizer (`@tideworthy/tidysites-platform/sanitize`) keeps an allowlist of tags and attributes and drops script, event handlers, javascript links, styles in the markup and frames to anywhere but a few known hosts; the row's CSS is scoped to the row (`.ts-row[data-row=…]`) and stripped of imports and remote fetches. A row can open the booking dialog with `data-tidy-dialog="ts-booking"`, and it sees the site's tokens, so a row written for one theme reads right on the next. The sandboxed frame section stays for the calculator or embed that needs script.

A row's markup can read the site's records, so a custom header or footer is as live as the frame's own. The vocabulary is small on purpose (`src/lib/template.ts`):

```
{{ business.phone }}  {{ business.phone_href }}  {{ business.email }}  {{ business.address_line }}  {{ business.hours }}  {{ business.logo.url }}  {{ business.logo_dark.url }}  {{ business.booking_url }}  {{ business.booking_label }}  {{ business.booking_heading }}
{{ page.title }}  {{ page.headline }}  {{ page.summary }}  {{ page.image.url }}  {{ page.url }}  {{ page.slug }}  {{ page.collection }}  {{ page.kind }}  {{ page.category.title }}
{{ site.title }}  {{ site.url }}  {{ site.year }}
{{#each services as s}} <a href="{{ s.url }}">{{ s.title }}</a> {{/each}}        also service_categories, service_areas, locations, people, reviews, faqs, posts, audiences, offers, plans, badges, brands, products, case_studies, clients
{{#each services limit=6}} … {{else}} nothing yet {{/each}}                     inside a loop: this, @index, @number, @first, @last, and the item's own fields
{{#if page.summary}} … {{else}} … {{/if}}   {{#unless x}} … {{/unless}}   {{#if page.collection == "services"}} … {{/if}}   {{#if f.sort == 1}} … {{/if}}   (a bare number, true, false or null is a value; a bare name is a path)
{{ media.hero.url }}  {{ media.hero.alt }}  {{ video.url }}     the row's own pictures, from its `media` list (name + picture), and its `video` file; <video src="{{ video.url }}" autoplay muted loop playsinline>
{{ o.ends_date }}  {{ r.initials }}     every date field has _date ("Nov 30, 2026"); an item's initials from its name (no relative times: the live site is a snapshot)
{{> menu "primary"}} {{> menu "footer" depth=1}} {{> menu "primary" collapsible=true}}  {{> logo}}  {{> phone}}  {{> email}}  {{> address}}  {{> hours}}  {{> social}}  {{> year}}  {{> button "Label" "/url" style=outline}}  {{> form "Name"}}
```

`page` is the record the address is for, whatever its collection, with the same names on every kind of page (plus the record's own fields), so one header written against `page.*` fits a service page, an area page and a custom page. Values are HTML-escaped (three braces print a value that is already HTML); the result goes through the sanitizer like any row; the drop-ins print the platform's own markup (`ts-menu`, `ts-logo`, `ts-phone`, `ts-address`, `ts-hours`, `ts-social`, `ts-btn`) after it. A link whose href is `#form:<Form name>` opens that form in a dialog, the way a section button does. Only the roots a text names are read. Columns HTML slots take the same vocabulary (without the form drop-in; the slot kind `form` does that).

A row placed as the header or the footer is wrapped in `<header class="ts-row ts-row-header">` or `<footer class="ts-row ts-row-footer">` (with `data-tidy-frame`); markup that brings its own `<header>` or `<footer>` is wrapped in a `<div>` instead, so the page has one of each. A row's `<img>` tags get the resized variants with `sizes="100vw"` (a row spans the page) unless the tag carries its own `sizes`; a Columns HTML slot's get the slot's share of the row. A full-width row (`ts-row-full`) has no section padding of its own: the row owns its space. The menu drop-in marks the current item `ts-menu-current` and the folder it sits in `ts-menu-ancestor`. A record's written content prints as `{{{ s.content_html }}}` (rich text as HTML; the blocks stay in `s.content` for loops), and every plain text field prints as `<p>`s through `{{{ s.summary_html }}}` (the text itself stays in `s.summary`). A row's CSS reaches its own wrapper through a selector that starts with `.ts-row`, `.ts-row-header`, `.ts-row-footer`, `&` or `:scope`; every other selector is scoped inside the row. The theme's own rules carry the weight of two classes (`.ts.ts-accent`, `.ts .ts-col h2`); a row's rule wins when written the same way or scoped under its own class. A theme's page classes (`.hero`, `.card`, `.sr`, whatever its `src/styles/*.css` names) do not reach into rows: the integration's Vite plugin (`lib/theme-css`) adds `:where(:not(.ts-row *))` to every class rule of the theme's own, so a row's `.sr` is the row's; element rules and the package's `ts-*` classes still apply inside rows. Inline SVG in a row keeps its masks, clip paths, gradients, filters and paint attributes (`fill-opacity`, `mask="url(#m)"`); a paint reference must name an id in the same markup.

A page chooses its header and footer: the site's, none, or a named custom row. A theme's layout reads that with `pageFrame(page.data)` and renders `frame/header`, nothing, or `sections/row` with `as="header"`. The `frame` record can replace the site's header or footer everywhere with a row, which `frame/header` and `frame/footer` render on their own.

## The sections that are not records

Most sections that show a row of things take their items written in the section: Cards (the feature section), Steps, Stats, FAQ, Gallery, Badges, Brands, Clients, Insurance, Payment and financing, Technology, Conditions, Policies, Forms (downloads), Signs, Options and Columns. Where a collection of the same thing exists (badges, brands, clients, insurers, financing providers, technologies, conditions, policies, downloads), the section reads it only when its own items are empty, so a thing gets a record when it is reused across pages or has a page of its own, and lives in its section otherwise. Offer renders from the section's own headline, value, how to claim and end date unless an offer record is named.

`details` is the Business details section: name, address, phone, email, hours day by day, socials and the map, each on or off, from the Business record or a named location, as a row, a card or two columns (`ts-details-*`, `ts-hours`). `audiences` lists the Who we serve records (the people or industries a service is for, each with a page at `/for/<slug>`, which a theme serves with a `for/[slug]` page) as cards, chips or a list.

## Saved sections

A section a site wants on several pages is kept once in `saved_sections` (a name and one section) and placed with the `saved` type by name; a change to the record changes every page. The editor's chip offers Share on any section (save it under a name and place the shared one in its stead) and Detach on a shared one (this page's own copy); a click on a shared section edits the record in place. `sections/defaults/saved.astro` renders the record's block through `One.astro`, which is also what `Sections.astro` renders each page block through.

## Columns

`columns` is the section for what used to become a custom row: any number of slots laid out `across` per row on a laptop, each holding text (markdown), an image, a card (icon, heading, text, link), a number, one of the site's forms by name, a video by URL, or the site's own HTML (sanitised like a row). A slot with `span: full row` takes the whole width, which is how the section gets an intro above the columns and an outro below. One slot is a band; eight small images across are a logo strip. On the section: `tone` (default, light, dark, accent) or a `background` photo, `width`, `align`, and `css_class` for the site's own stylesheet. A section with `continue_background` joins the one above it: `Sections.astro` wraps the run in `.ts-group` and draws the head's tone and photo once behind every member. The markup is `ts-columns`, `ts-cols` (`--cols`), `ts-col`, `ts-col-<kind>`, `ts-col-full`; the markdown renders into `ts-prose`.

Every section's frame carries `ts-section`, `ts-type-<type>` and `ts-key-<key>`, and the themes put `ts-<collection>` and `ts-page-<slug>` on the body, so a site's CSS can address one section on one page without a custom row.

## Layouts every section shares

Plain text fields (a service summary, a step, a feature point, a FAQ answer, a policy, an intro body) print as paragraphs: a blank line starts a new paragraph, a single newline breaks the line, and the gap between paragraphs is `--ts-para-gap` (`.75em` unless the site sets it). The FAQ's `open_first` opens the first question at rest. Posts carry `post_date`, their own date, shown and sorted by; the fill writes it over the store's publish stamp. Posts and products carry `sections` like services: when set, the record's page is those sections. A listing address of `/` on the frame record puts the records at the root, behind the pages. Forms mark required boxes with * when `mark_required` is on (`ts-required`), and a one-choice question's hint labels the empty option. The call to action band prints the Business record's call-to-action line as its heading only when the section has no headline, no text and no buttons of its own; `show_phone` false drops the phone button. Reviews, team, services, brands, clients and gallery offer a `carousel` layout (a scroll-snap track with arrows, `ts-carousel-*`); the FAQ offers `tabs` and `two columns` (`ts-tabs`, `ts-tab`, `ts-tab-panel`); plans and products offer `compare` (`ts-compare`); the CTA offers `band with email` (an email-only form). Galleries open in a lightbox unless the section turns it off (`ts-lightbox-*`). The header renders a top bar from the `frame` record's "line above the header" and the phone call bar at the bottom of small screens from its "bar at the bottom of the phone screen" setting (`ts-topbar-*`, `ts-callbar-*`). The same record sets the pop-up: what it shows (an offer by name, or a form by name), when it opens (on arrival, after ten or thirty seconds, after scrolling halfway, on leaving) and how often (once a visit, once a day, every time); the frame renders it in the dialog (`ts-popup`).

## Forms

A button opens a form instead of a page when its link is `#form:<Form name>`: the hero's buttons, the intro's, the Cards button, the call-to-action band's and a Columns slot's. `sections/Action.astro` renders the button and a dialog holding that form (`ts-form-<slug>`), opened by the platform's own opener; a theme's section does the same by rendering `Action` where it renders a button, or by checking `formDialog(href)` from `sections/lib` and keeping its own markup for the plain case.

A form is a record in the `forms` collection: a name, the contact details it asks for (and for each of the Name, Phone and Email boxes its own label and hint, `name_label`, `name_placeholder`, …; `contact_fields_position` puts the contact boxes after the questions instead of before them), its questions (short or long answer, one or several choices, a date, a number; each with its label, choices, whether it is required and a hint), the button label, the thank-you and the spam check (`bot_check`: the hidden field alone, Turnstile shown only when a visitor has to act, or "Turnstile, always visible" for a box that sits in the form at rest, `ts-turnstile`). `@tideworthy/tidysites-platform/sections/form` renders one anywhere by name:

```astro
---
import Form from "@tideworthy/tidysites-platform/sections/form";
---
<Form name="Schedule a make up" class="ts-card" />
```

The `form` section places one on a page; the hero, contact and CTA sections take a form name in their Form field and render that instead of their built-in questions; the header's booking button opens the Business record's booking form in the dialog. Every form posts to `/api/lead` with the contact columns, the form's name and each answer under its question's label, and shows the form's thank-you in place (without JavaScript, the route redirects to `/thank-you`).

The route is the package's too. A theme's server routes delegate to it, on staging and on the live site:

```ts
import { handleLead } from "@tideworthy/tidysites-platform/lead";
if (path === "/lead") return handleLead(request, env);
```

It drops honeypot hits, checks Turnstile when `TURNSTILE_SECRET` is bound, and forwards the lead to the control plane with every answer (the platform stores it beside the site, emails the site's recipients and fires its webhooks).

## Framing the staging preview

EmDash answers every page with `X-Frame-Options: SAMEORIGIN` unless a Content-Security-Policy is present. `tidyPlatform()` registers a middleware that, when the site carries a `TIDY_FRAME_ANCESTORS` variable (space-separated https origins), replaces that header with `Content-Security-Policy: frame-ancestors 'self' <origins>` so the platform's website page can embed the site. Without the variable nothing changes.

## The gallery

`GET /_tidy/gallery` renders every section type and layout in the site's own theme with sample text and a label under an index, inside the theme's `src/layouts/Base.astro` when it has one. It is the catalogue a builder screenshots before choosing a section (`/_tidy/gallery#columns`). The sections that read records show the site's own records. The live worker never serves it and the publish never lists it.

## The on-site editor

A template built from sections (an EmDash `blocks` field) uses the Tideworthy editor on the site:

```astro
---
import TidyEditor from "@tideworthy/tidysites-platform/editor";
import seed from "../../seed/seed.json";
---
<TidyEditor collection="pages" id={page.data.id} field="sections" blocks={seed.blockTypes} value={page.data.sections} records={[{ collection: "business", id, label: "Business details" }]} />
```

The template renders the sections inside `<div data-tidy-blocks>` and each one inside `<div data-tidy-block={_key} data-tidy-type={_type}>`. `blocks` is the seed's `blockTypes` (the same definitions EmDash's admin and MCP read); the form for a block comes from its retained version's fields. Hovering a block shows a chip (Edit, move, add below, remove); Edit opens the panel; Save writes the field through EmDash's content API with the signed-in editor's session, as a draft, and reloads. Publish appears when EmDash says the page has a draft (so a draft an agent staged over the API is publishable from the page) and publishes it. Image fields get a picker over the media library with upload and store EmDash's media value. Records: wrap a region in `data-tidy-record="services" data-tidy-record-id="…" data-tidy-record-label="Service details"` and pass `records` to the component; the form comes from EmDash's manifest and saves publish at once. Pass the business record in `records` and it is always one click away in the bar. A section that lists records (a services grid) wraps each card in the same `data-tidy-record` attributes, so the card edits its record and the section's chip edits the section. On these pages EmDash's toolbar is hidden and its inline editing is off; article bodies keep EmDash's inline editor by not passing a sections field.

Editing in place: a click on a heading, a paragraph, a button label or a list item edits that one field where it stands (matched by its text, so a theme needs no markers); a Columns slot's text opens a markdown box; an image opens the picker for that field; a custom row's text and images are edited in the row and its HTML written back to the page or to the shared row record. The chip's Edit still opens the whole form.

## Bindings the routes read

| Binding | Type | Purpose |
|---|---|---|
| `TIDY_PLATFORM_SECRET` | secret | Bearer token every `/_tidy/*` route requires. When absent, every route answers 404. |
| `TIDY_CONTROL_ORIGIN` | var | Control plane origin the publish hooks call. |
| `TIDY_SITE_ID` | var | This site's id on the platform. |
| `PLATFORM` | service binding | The control plane worker. Publish requests go over this binding, never over public fetch. |

Without the last three, the publish hooks are a no-op.

## Routes

All routes are under `/_tidy/` on the staging hostname. Every route except the session claim requires `Authorization: Bearer <TIDY_PLATFORM_SECRET>`. Wrong or missing bearer: 401. No secret bound: 404. JSON in, JSON out, `cache-control: no-store`.

### `POST /_tidy/bootstrap`

Headless first run for a freshly provisioned site. Applies the template seed, creates the platform's admin user, marks setup complete, and mints an API token with every scope.

```json
{ "adminEmail": "platform@example.com", "adminName": "Platform", "title": "Acme Plumbing", "tagline": "Fast fixes", "siteUrl": "https://acme.example.com", "tokenName": "platform" }
```

Returns `{ ok, userId, token, steps }`. The token is only ever returned here and by `rotate-token`; store it. Idempotent: a later call skips the seed and setup, keeps the user, and replaces the token of that name.

### `POST /_tidy/session`

Mints a one-time sign-in link for a person the platform has already authenticated.

```json
{ "email": "jo@agency.com", "name": "Jo", "role": "admin", "redirect": "/_emdash/admin", "editMode": false, "ttlSeconds": 120 }
```

`role` is `admin` or `editor` and is applied to the EmDash user every time, so the platform's role mapping wins. `redirect` must be a local path. `ttlSeconds` is clamped to 30 to 600. Returns `{ ok, userId, claimUrl, expiresAt }`. Send the browser to `claimUrl`.

### `GET /_tidy/session/claim?t=…`

The browser lands here. Signs the user in (an Astro session, exactly as EmDash's own login does), sets or clears the visual-editing cookie, and redirects with 303 to the requested path. A link can be used once. Expired, reused, or unknown links get a 410 page.

### `GET /_tidy/edit?on=1|0&to=/path`

No bearer. For the browser session the claim signed in: sets (`on=1`) or clears the `emdash-edit-mode` cookie and answers 303 to `to` (a local path; anything else becomes `/`). Without a signed-in session it answers the same 303 and changes nothing. The editor's pill links here.

### `GET /_tidy/health`

`{ ok, plugin, setupComplete, siteTitle, siteUrl, migrations: { applied, pending }, time }`. `ok` is false and the status is 503 when migrations are pending.

### `POST /_tidy/rotate-token`

Replaces the platform API token. `{ "email": "...", "tokenName": "platform" }`. Both optional: with no email, the token's current owner is used. Returns `{ ok, userId, token }`.

### `POST /_tidy/fill`

Writes real content over the template's sample content on a bootstrapped site. Same document shape as a seed's `content` section, so `$ref:<id>` and `$media: { url, alt, filename }` resolve the same way (media is downloaded into the site's storage).

```json
{
  "settings": { "title": "Romney Pest Control", "tagline": "Pest control on demand" },
  "content": {
    "services": [{ "id": "ant-control", "data": { "title": "Ant control", "summary": "…" } }],
    "reviews": [{ "id": "google-1", "data": { "title": "Dana R.", "quote": "…", "rating": 5, "service": "$ref:ant-control" } }]
  },
  "remove": { "services": ["mosquito-treatment"], "posts": ["fire-ants-after-rain"] }
}
```

Entries are upserted by slug (`slug` defaults to `id`). An existing entry keeps every field the document does not name, so a fill can send only what it knows and the template's images and blocks stay underneath. `remove` deletes the named sample entries; slugs written by the same call are never removed, and unknown slugs are reported back in `missing`. Refuses with 409 before bootstrap. Returns `{ ok, settings, content: { created, updated, media }, removed, missing }`. Re-running the same document is safe.

### `POST /_tidy/schema?budgetMs=25000&force=1`

Applies the template seed's structure to a site that is already set up: block types (new ones created, compatible versions amended), collections and their fields (existing ones updated to the template's definition, missing ones added, nothing deleted) and relations. Entries, settings, menus, taxonomies and sections are untouched. Refuses with 409 before bootstrap. Returns `{ ok, applied }` with EmDash's counts. This is how a template schema change reaches a site provisioned before it; the platform calls it before deploying the new template artifact.

### `GET /_tidy/pages`

Every address the site renders (`{ ok, pages: [{ path, kind, collection?, id?, slug?, title, noindex?, updated? }] }`; `updated` is when the record last changed, a listing's its newest record's, for the sitemap's lastmod): the home page, the pages, each listing that is on, the blog and its facets, and every record whose page is on, at the site's own URL patterns.

### `POST /_tidy/maintenance?cron=…`

Runs EmDash's scheduled work now (scheduled publishing, cleanup) and returns what it published. Workers in a dispatch namespace never receive cron triggers, so the platform's cron calls this on every site each minute.

### `GET|POST /_tidy/revisions`

The site's revision history for the signed-in editor (the Astro session is the gate, no bearer). `GET ?path=/x` lists every publish; `GET ?id=<revision>&path=/x` returns that page as it was in the revision, read from the control plane's stored copy; `POST {action:"restore", id}` puts the live site and the staging content back on it; `POST {action:"publish"}` makes the live site follow staging now. The editor bar's Revisions and Publish live controls call it; `?tidy-revisions=1` on any page opens the list and `?tidy-revision=<id>` opens that revision of the page.

## Publish hooks

The plugin registers `content:afterPublish`, `content:afterUnpublish`, and `content:afterDelete`. Each posts `{ reason, collection, id }` to `POST <TIDY_CONTROL_ORIGIN>/sites/<TIDY_SITE_ID>/publish` over the `PLATFORM` binding with the site secret as bearer. Hooks run with `errorPolicy: "continue"` and an 8 second timeout, so a slow or failing control plane never fails the editor's publish.

## Calling the routes

```ts
import { createTidySiteClient } from "@tideworthy/tidysites-platform/client";

const site = createTidySiteClient({ origin: "https://staging-acme.example.dev", secret, fetch: (r) => namespace.get("site-acme").fetch(r) });
await site.health();
const { claimUrl } = await site.mintSession({ email, role: "editor", editMode: true, redirect: "/" });
```

## Security model

- The secret is compared in constant time and never echoed.
- Every route disappears (404) when the secret is not bound, so an exported site exposes nothing.
- Sign-in links are random 256-bit tokens, single use, and expire within ten minutes. Redirect targets must be local paths.
- The plugin never reads or writes content; it only notifies the platform.
- Nothing in this package holds a credential. Secrets arrive as worker bindings.

## License

MIT.
