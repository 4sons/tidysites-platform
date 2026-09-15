/**
 * Ask the control plane to snapshot staging into the live site. Called by the
 * EmDash hook plugin after publish, unpublish, and delete.
 *
 * The call goes over the PLATFORM service binding: a Worker cannot reach
 * another Worker on the same zone with plain fetch. Without the bindings this
 * is a no-op, which is what an exported site needs.
 */
export interface PublishEnv {
	TIDY_CONTROL_ORIGIN?: unknown;
	TIDY_SITE_ID?: unknown;
	TIDY_PLATFORM_SECRET?: unknown;
	PLATFORM?: { fetch(input: string, init?: RequestInit): Promise<Response> };
}

export interface PublishEvent {
	reason: "publish" | "unpublish" | "delete";
	collection?: string;
	id?: string;
}

export type PublishOutcome = { sent: false; why: "no-bindings" } | { sent: true; status: number } | { sent: false; why: "error"; error: string };

export async function requestPublish(env: PublishEnv | undefined, event: PublishEvent): Promise<PublishOutcome> {
	const origin = env?.TIDY_CONTROL_ORIGIN;
	const siteId = env?.TIDY_SITE_ID;
	const secret = env?.TIDY_PLATFORM_SECRET;
	const platform = env?.PLATFORM;
	if (!platform || typeof origin !== "string" || typeof siteId !== "string" || typeof secret !== "string") return { sent: false, why: "no-bindings" };
	try {
		const r = await platform.fetch(`${origin.replace(/\/+$/, "")}/sites/${encodeURIComponent(siteId)}/publish`, {
			method: "POST",
			headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
			body: JSON.stringify(event)
		});
		if (!r.ok) console.error("[tidy-platform] publish request failed:", r.status);
		return { sent: true, status: r.status };
	} catch (err) {
		console.error("[tidy-platform] publish request error:", err);
		return { sent: false, why: "error", error: String(err) };
	}
}
