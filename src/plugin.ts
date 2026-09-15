/**
 * The EmDash hook plugin (native, in-process). Loaded by EmDash through the
 * descriptor from `tidyPlatformPlugin()`; EmDash imports `createPlugin` from
 * this module and calls it with the descriptor's options.
 *
 * After a publish, unpublish, or delete it asks the control plane to snapshot
 * staging into the live site. Every hook is `errorPolicy: "continue"` with a
 * short timeout, so a control-plane hiccup never fails an editor's publish.
 */
import { definePlugin } from "emdash";
import { hookEnv } from "./lib/env";
import { requestPublish, type PublishEnv, type PublishEvent } from "./lib/publish";
import { PLUGIN_ID, VERSION } from "./version";

export const HOOK_TIMEOUT_MS = 8000;

type ContentEvent = { content?: { id?: unknown }; collection?: string; id?: unknown };

async function notify(reason: PublishEvent["reason"], event: ContentEvent): Promise<void> {
	const env = (await hookEnv()) as PublishEnv | undefined;
	const id = event.content?.id ?? event.id;
	await requestPublish(env, { reason, collection: event.collection, ...(typeof id === "string" ? { id } : {}) });
}

function hook(reason: PublishEvent["reason"]) {
	return {
		errorPolicy: "continue" as const,
		timeout: HOOK_TIMEOUT_MS,
		handler: async (event: ContentEvent) => {
			await notify(reason, event);
		}
	};
}

export function createPlugin(_options: Record<string, unknown> = {}) {
	return definePlugin({
		id: PLUGIN_ID,
		version: VERSION,
		// Content hooks are only registered for plugins that may read content.
		capabilities: ["content:read"],
		hooks: {
			"content:afterPublish": hook("publish"),
			"content:afterUnpublish": hook("unpublish"),
			"content:afterDelete": hook("delete")
		}
	});
}
