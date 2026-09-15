# Maintaining @tidysites/platform

Internal notes for the team. The README is the user-facing contract; this file is how the package is built, tested, released, and kept working across EmDash versions.

## Layout

```
src/index.ts              tidyPlatform() integration + tidyPlatformPlugin() descriptor
src/plugin.ts             createPlugin(): the EmDash hook plugin (EmDash imports this by name)
src/client.ts             typed caller for the routes (control plane, platform app)
src/routes/*.ts           thin Astro route modules, one per /_tidy/* path
src/routes/_shared.ts     env + gate + deps + error wrapping for every route
src/lib/handlers.ts       the route logic, pure, no Astro or EmDash imports
src/lib/store.ts          PlatformStore interface + createEmdashStore(db) over EmDash repositories
src/lib/runtime.ts        THE list of EmDash internals we depend on (see below)
src/lib/auth.ts           bearer gate, constant-time compare
src/lib/http.ts           JSON helpers, validators, random tokens
src/lib/publish.ts        the control-plane publish request the hooks send
src/lib/env.ts            cloudflare:workers env for hook code (outside a request)
test/                     vitest; handlers run against test/memory-store.ts
```

The package ships TypeScript source (`exports` point at `src/*.ts`). Astro's Vite build compiles it inside the consuming site. There is no build step here; `npm run check` is typecheck plus tests.

## Why routes and a plugin, not just a plugin

EmDash native plugins run in-process but their context has no database (content, media, storage, http, kv, log only). Bootstrap, sessions, and token rotation need the users, options, and token tables, so they are Astro routes that reach the database through `getDb()` from `emdash/runtime`. The plugin only carries the publish hooks. Content hooks are registered only when the plugin declares `capabilities: ["content:read"]`; without it they are silently skipped.

## EmDash internals we depend on

Re-verify every line of this list when bumping the EmDash peer range. All are public exports, but EmDash minors can change them.

| Import | Used for | Where |
|---|---|---|
| `emdash` `OptionsRepository`, `UserRepository`, `ulid`, `getMigrationStatus`, `applySeed`, `validateSeed`, `definePlugin` | options, users, tokens, health, seed, plugin | runtime.ts, store.ts, plugin.ts |
| `emdash/runtime` `getDb()` | the singleton Kysely for the configured database | runtime.ts |
| `emdash/seed` `loadSeed()` | the template's seed file at build time (path from `package.json` `emdash.seed`) | runtime.ts |
| `emdash/middleware` `runScheduledTasks()` | scheduled publishing on demand | routes/maintenance.ts |
| `@emdash-cms/auth` `generatePrefixedToken`, `VALID_SCOPES` | API token minting (`ec_pat_` prefix, hash stored) | runtime.ts |
| Tables `users`, `options`, `_emdash_api_tokens` (direct Kysely) | role update, email_verified, token replace, handoff sweep | store.ts |
| Option names `emdash:setup_complete`, `emdash:setup_state`, `emdash:site_title`, `emdash:site_tagline`, `emdash:site_url` | setup completion, health | handlers.ts |
| Astro `context.session.set("user", { id })` | sign-in, identical to EmDash's `handleDevBypass` and passkey login | routes/session-claim.ts |
| Cookie `emdash-edit-mode=true` | visual editing mode | routes/session-claim.ts |
| Roles: admin 50, editor 40 | role mapping | store.ts `ROLE_LEVEL` |

Handoff tokens for sign-in links live in the `options` table under `tidy:handoff:<token>` with an `expiresAt`; they are deleted on claim and swept on every mint. No extra binding is needed for them.

Known limitation: `applySeed` is called without a `storage` provider, so a seed that references media files will not have them copied. Today's templates carry no seed media. If one does, pass EmDash's storage from `locals.emdash.storage` (only present on editor requests) or build it from the configured storage descriptor.

## Testing

- `npm test` runs the unit suites against the in-memory store: auth gate, validators, every handler and its edge cases (idempotent bootstrap, invalid seed, role remap, disabled users, single-use and expiry of sign-in links, unsafe redirects, token rotation by email and by name, health), the publish request, the hook plugin, the integration entry, and the client.
- The live proof is a site provisioned from a template built with this package: bootstrap through the control plane, `health`, a minted session claimed with cookies landing on `/_emdash/admin`, edit mode on a page, a reused link answering 410, `rotate-token` invalidating the old token, `maintenance` publishing a scheduled entry, and an EmDash publish reaching production. Steps and results for 0.1.0 are recorded in `tidysites-plan.md` section 9 and `workers/tidysites-control/SPIKE.md` in the platform repo.

## Releasing

1. Bump `version` in `package.json` and `VERSION` in `src/version.ts` (a test fails if they differ). Add a CHANGELOG entry.
2. `npm run check`.
3. Commit, tag `vX.Y.Z`, push the tag. CI runs the check.
4. Publish to npm (`npm publish --access public`) from an account with rights on the `@tidysites` scope. Until the scope is set up, templates pin the git tag: `"@tidysites/platform": "github:4sons/tidysites-platform#vX.Y.Z"`.
5. Bump the version in each template's `package.json`, rebuild the template, and roll it through the platform's template rollout. Sites pick up the new package with their next template artifact; nothing is hot-swapped.

## Upgrading EmDash

1. Read the EmDash release notes between the pinned version and the target for: repositories, `getDb`, `runScheduledTasks`, seed functions, session shape, the edit-mode cookie, role levels, the `_emdash_api_tokens` and `options` tables.
2. Widen or move the peer range in `package.json`, install, `npm run check`.
3. Build a template against it and run the live proof above on a throwaway site before any template pointer moves.
4. Ship a minor of this package; templates pin both the EmDash version and this package's version together.

## What must never land here

- Anything from the platform app's source or the control plane. This repo is public and installed in every client site.
- Credentials of any kind. Secrets are worker bindings.
- Product copy. Routes speak JSON; the one HTML page is the expired-link notice.
