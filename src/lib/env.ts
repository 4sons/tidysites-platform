/**
 * The worker env for code that runs outside a request (the EmDash hook plugin).
 * Resolved at call time: EmDash probes plugin modules at build time in Node,
 * where `cloudflare:workers` does not exist.
 */
export async function hookEnv(): Promise<Record<string, unknown> | undefined> {
	try {
		const mod = (await import("cloudflare:workers")) as unknown as { env?: Record<string, unknown> };
		return mod.env;
	} catch {
		return undefined;
	}
}
