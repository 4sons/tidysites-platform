/**
 * Virtual modules the EmDash Astro integration generates inside a site build.
 * They exist only there; the package reaches them with dynamic imports that
 * are wrapped in try/catch, so tests and Node never touch them.
 */
declare module "virtual:emdash/config" {
	const config: { storage?: { entrypoint?: string; config?: unknown } } & Record<string, unknown>;
	export default config;
}
declare module "virtual:emdash/storage" {
	export const createStorage: ((config: unknown) => unknown) | undefined;
}
