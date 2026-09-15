# Changelog

## 0.1.2

- Published to npm as `@tidysites/platform`. Release workflow publishes on version tags with provenance. No code changes.

## 0.1.1

- Fix: the routes read the worker env from `cloudflare:workers` only. 0.1.0 touched `locals.runtime.env` first, which the Cloudflare adapter for Astro 6+ removed with a throwing getter, so every gated route failed on Astro 7. Not usable; use 0.1.1.

## 0.1.0

First release. Replaces the routes and plugin that lived inline in `template-home-services`.

- Astro integration `tidyPlatform()` injecting `/_tidy/bootstrap`, `/_tidy/session`, `/_tidy/session/claim`, `/_tidy/health`, `/_tidy/rotate-token`, `/_tidy/maintenance` as server routes. The routes reach the database through `getDb()`, so the old worker-level `/_tidy/*` rewrite and edit-mode cookie trick are gone.
- EmDash plugin descriptor `tidyPlatformPlugin()` and `createPlugin()` with `content:afterPublish`, `content:afterUnpublish`, `content:afterDelete` hooks (`errorPolicy: "continue"`, 8 s timeout) that post `{ reason, collection, id }` to the control plane over the `PLATFORM` binding.
- One-time sign-in links: mint with the site secret, claim from a browser, single use, 30 to 600 s lifetime, local redirects only.
- Token rotation by email or by token name; health with migration status.
- `@tidysites/platform/client`: a typed caller for all routes.
