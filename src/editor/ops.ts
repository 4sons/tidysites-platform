/**
 * Pure operations on a page's block list (a Portable Text array whose custom
 * blocks carry `_type` and `_key`). The editor runtime calls these; the tests
 * cover them without a browser.
 */
export type Block = { _type: string; _key?: string } & Record<string, unknown>;

export interface FieldSchema {
	type: "text_input" | "number_input" | "toggle" | "select" | "repeater" | string;
	action_id: string;
	label: string;
	multiline?: boolean;
	options?: Array<{ label: string; value: string }>;
	fields?: FieldSchema[];
	item_label?: string;
	min_items?: number;
	max_items?: number;
}

export interface BlockSchema {
	type: string;
	label: string;
	category?: string;
	description?: string;
	fields: FieldSchema[];
}

export function newKey(random: () => number = Math.random): string {
	let s = "";
	for (let i = 0; i < 12; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)];
	return s;
}

export function findBlock(blocks: Block[], key: string): Block | undefined {
	return blocks.find((b) => b._key === key);
}

/** The block with `key` gets `data` merged over it; `_type` and `_key` never change. */
export function updateBlock(blocks: Block[], key: string, data: Record<string, unknown>): Block[] {
	return blocks.map((b) => (b._key === key ? { ...b, ...data, _type: b._type, _key: b._key } : b));
}

export function moveBlock(blocks: Block[], key: string, direction: -1 | 1): Block[] {
	const i = blocks.findIndex((b) => b._key === key);
	const j = i + direction;
	if (i < 0 || j < 0 || j >= blocks.length) return blocks;
	const out = blocks.slice();
	const a = out[i] as Block;
	out[i] = out[j] as Block;
	out[j] = a;
	return out;
}

export function removeBlock(blocks: Block[], key: string): Block[] {
	return blocks.filter((b) => b._key !== key);
}

/** Insert a new block of `type` after the block with `afterKey` (or at the end). */
export function insertBlock(blocks: Block[], type: string, afterKey: string | null, data: Record<string, unknown>, key = newKey()): Block[] {
	const block: Block = { ...data, _type: type, _key: key };
	const i = afterKey ? blocks.findIndex((b) => b._key === afterKey) : -1;
	if (i < 0) return [...blocks, block];
	return [...blocks.slice(0, i + 1), block, ...blocks.slice(i + 1)];
}

/** Empty values for every field in a schema, so a new block renders without holes. */
export function defaultsFor(schema: BlockSchema): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const f of schema.fields) {
		if (f.type === "toggle") out[f.action_id] = false;
		else if (f.type === "number_input") out[f.action_id] = null;
		else if (f.type === "select") out[f.action_id] = f.options?.[0]?.value ?? "";
		else if (f.type === "repeater") out[f.action_id] = [];
		else out[f.action_id] = "";
	}
	return out;
}

/** Coerce a raw form value into the field's stored type. */
export function coerce(field: FieldSchema, raw: unknown): unknown {
	switch (field.type) {
		case "toggle":
			return raw === true || raw === "on" || raw === "true";
		case "number_input": {
			if (raw === "" || raw === null || raw === undefined) return null;
			const n = Number(raw);
			return Number.isFinite(n) ? n : null;
		}
		case "repeater":
			return Array.isArray(raw) ? raw : [];
		default:
			return typeof raw === "string" ? raw : raw === null || raw === undefined ? "" : String(raw);
	}
}
