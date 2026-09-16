/**
 * @tideworthy/tidysites-platform
 *
 * Two exports a template wires into astro.config.mjs:
 *
 *   import emdash from "emdash/astro";
 *   import { tidyPlatform, tidyPlatformPlugin } from "@tideworthy/tidysites-platform";
 *
 *   integrations: [
 *     tidyPlatform(),
 *     emdash({ ..., plugins: [tidyPlatformPlugin()] }),
 *   ]
 *
 * `tidyPlatform()` injects the /_tidy/* routes. `tidyPlatformPlugin()` is the
 * EmDash plugin descriptor for the publish hooks. See README.md.
 */
import type { AstroIntegration } from "astro";
import { PLUGIN_ID, VERSION } from "./version";

export { VERSION, PLUGIN_ID };

const PACKAGE = "@tideworthy/tidysites-platform";

export const PLATFORM_ROUTES = [
	{ pattern: "/_tidy/bootstrap", entrypoint: `${PACKAGE}/routes/bootstrap` },
	{ pattern: "/_tidy/session", entrypoint: `${PACKAGE}/routes/session` },
	{ pattern: "/_tidy/session/claim", entrypoint: `${PACKAGE}/routes/session-claim` },
	{ pattern: "/_tidy/health", entrypoint: `${PACKAGE}/routes/health` },
	{ pattern: "/_tidy/rotate-token", entrypoint: `${PACKAGE}/routes/rotate-token` },
	{ pattern: "/_tidy/fill", entrypoint: `${PACKAGE}/routes/fill` },
	{ pattern: "/_tidy/maintenance", entrypoint: `${PACKAGE}/routes/maintenance` }
] as const;

/** Astro integration: registers every platform route as a server route. */
export function tidyPlatform(): AstroIntegration {
	return {
		name: PACKAGE,
		hooks: {
			"astro:config:setup": ({ injectRoute }) => {
				for (const route of PLATFORM_ROUTES) injectRoute({ pattern: route.pattern, entrypoint: route.entrypoint, prerender: false });
			}
		}
	};
}

/** EmDash plugin descriptor for `emdash({ plugins: [tidyPlatformPlugin()] })`. */
export function tidyPlatformPlugin() {
	return {
		id: PLUGIN_ID,
		version: VERSION,
		format: "native" as const,
		entrypoint: `${PACKAGE}/plugin`
	};
}
