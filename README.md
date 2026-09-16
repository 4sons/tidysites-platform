# @tideworthy/tidysites-platform

The Tidysites platform integration for [EmDash](https://emdash.dev) sites on Astro. It adds a small set of platform routes under `/_tidy/*` and an EmDash plugin whose publish hooks tell the platform to ship the site live.

It is the only code in a Tidysites template that knows about the platform, and it does nothing when the platform's secret is not bound to the worker. A site exported from the platform keeps this package installed and runs unchanged.

## Install

```sh
npm install @tideworthy/tidysites-platform
```

Peer dependencies: `astro` 7, `emdash` and `@emdash-cms/auth` 0.37.x, `kysely`. Published on npm as `@tideworthy/tidysites-platform`; GitHub tags `vX.Y.Z` match each version.

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

## Framing the staging preview

EmDash answers every page with `X-Frame-Options: SAMEORIGIN` unless a Content-Security-Policy is present. `tidyPlatform()` registers a middleware that, when the site carries a `TIDY_FRAME_ANCESTORS` variable (space-separated https origins), replaces that header with `Content-Security-Policy: frame-ancestors 'self' <origins>` so the platform's website page can embed the site. Without the variable nothing changes.

## The on-site editor

EmDash's inline editor edits plain rich text; a Block Kit block inside a Portable Text field renders as an "edit in admin" placeholder. Templates built from blocks use the Tideworthy editor instead:

```astro
---
import TidyEditor from "@tideworthy/tidysites-platform/editor";
const editMode = Astro.cookies.get("emdash-edit-mode")?.value === "true";
---
{editMode && <TidyEditor collection="pages" id={page.data.id} blocks={blockSchema} value={content} />}
```

The template renders the block list inside `<div data-tidy-blocks>` and each custom block inside `<div data-tidy-block={_key} data-tidy-type={_type}>`, and passes `PortableText` a copy of the array (`[...blocks]`) so EmDash's inline editor does not mount on it. `blocks` is the plugin definition's `portableTextBlocks`. Hovering a block shows a chip (Edit, move, add below, remove); Edit opens a panel built from the block's fields; Save writes a draft through EmDash's content API with the signed-in editor's session and reloads; Publish publishes every entry saved in the session. A text field whose id ends in `imageUrl` (or `photoUrl`, `logoUrl`) gets an image picker over the media library with upload. Records: wrap a region in `data-tidy-record="services" data-tidy-record-id="…" data-tidy-record-label="Service details"` and pass `records` to the component; the form comes from EmDash's manifest and saves publish at once. Pass the business record in `records` and it is always one click away in the pill. On these pages EmDash's toolbar is hidden and its inline editing is off; article bodies keep EmDash's inline editor by passing the original array and not mounting this component.

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

### `POST /_tidy/maintenance?cron=…`

Runs EmDash's scheduled work now (scheduled publishing, cleanup) and returns what it published. Workers in a dispatch namespace never receive cron triggers, so the platform's cron calls this on every site each minute.

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
