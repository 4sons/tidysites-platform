/**
 * A typed caller for the /_tidy/* routes, for the control plane and the
 * platform app. Pass `fetch` to route calls through a dispatch-namespace
 * binding instead of the public internet.
 */
import type { BootstrapInput, BootstrapResult, FillEntry, FillInput, FillResult, HealthResult, MintSessionInput, MintSessionResult, RotateTokenInput } from "./lib/handlers";

export type { BootstrapInput, BootstrapResult, FillEntry, FillInput, FillResult, HealthResult, MintSessionInput, MintSessionResult, RotateTokenInput };

export interface MaintenanceResult {
	ok: true;
	cron: string | null;
	published: number;
	refs: Array<{ collection: string; id: string }>;
	ms: number;
	at: string;
}

export class TidySiteError extends Error {
	constructor(
		public status: number,
		public body: unknown
	) {
		super(`tidy site route failed: ${status}`);
	}
}

export interface TidySiteClientOptions {
	/** The site's staging origin, e.g. https://staging-acme.tidysites.dev */
	origin: string;
	/** The per-site TIDY_PLATFORM_SECRET. */
	secret: string;
	/** A fetch to use, e.g. a dispatch namespace binding's `.fetch`. Defaults to global fetch. */
	fetch?: (input: Request) => Promise<Response>;
}

export function createTidySiteClient(options: TidySiteClientOptions) {
	const origin = options.origin.replace(/\/+$/, "");
	const doFetch = options.fetch ?? ((r: Request) => fetch(r));

	async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
		const r = await doFetch(
			new Request(`${origin}${path}`, {
				method,
				headers: { authorization: `Bearer ${options.secret}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
				...(body !== undefined ? { body: JSON.stringify(body) } : {})
			})
		);
		const data: unknown = await r.json().catch(() => null);
		if (!r.ok) throw new TidySiteError(r.status, data);
		return data as T;
	}

	return {
		bootstrap: (input: BootstrapInput) => call<BootstrapResult>("POST", "/_tidy/bootstrap", input),
		mintSession: (input: MintSessionInput) => call<MintSessionResult>("POST", "/_tidy/session", input),
		health: () => call<HealthResult>("GET", "/_tidy/health"),
		rotateToken: (input: RotateTokenInput = {}) => call<{ ok: true; userId: string; token: string }>("POST", "/_tidy/rotate-token", input),
		fill: (input: FillInput) => call<FillResult>("POST", "/_tidy/fill", input),
		maintenance: (cron?: string) => call<MaintenanceResult>("POST", `/_tidy/maintenance${cron ? `?cron=${encodeURIComponent(cron)}` : ""}`)
	};
}

export type TidySiteClient = ReturnType<typeof createTidySiteClient>;
