/**
 * Pure operations on a page's section list: an EmDash `blocks` field value,
 * an array of typed blocks each carrying `_type`, `_version` and `_key`. The
 * schemas are EmDash block type definitions (the seed's `blockTypes`), so the
 * editor's forms, the admin's block editor and the MCP all read one contract.
 * The editor runtime calls these; the tests cover them without a browser.
 */
export type Block = { _type: string; _key?: string; _version?: number } & Record<string, unknown>;

/** The field types a block definition may use (EmDash 1.0). */
export type FieldType = "string" | "text" | "url" | "number" | "integer" | "boolean" | "datetime" | "select" | "multiSelect" | "portableText" | "image" | "file" | "repeater";

export interface FieldSchema {
	slug: string;
	label: string;
	type: FieldType | string;
	required?: boolean;
	defaultValue?: unknown;
	description?: string;
	validation?: {
		options?: string[];
		subFields?: FieldSchema[];
		minItems?: number;
		maxItems?: number;
		[key: string]: unknown;
	};
}

/** One block type as the seed declares it. */
export interface BlockTypeSchema {
	slug: string;
	label: string;
	description?: string;
	category?: string;
	currentVersion: number;
	versions: Array<{ version: number; fields: FieldSchema[] }>;
}

/** Field types the editor renders a control for; the rest are read-only here and edited in the admin. */
export const EDITABLE_TYPES: ReadonlySet<string> = new Set(["string", "text", "url", "number", "integer", "boolean", "datetime", "select", "multiSelect", "image", "repeater"]);

/** The fields of one retained version, or of the active version. */
export function fieldsOf(type: BlockTypeSchema, version?: number): FieldSchema[] {
	const v = version ?? type.currentVersion;
	return type.versions.find((x) => x.version === v)?.fields ?? type.versions.find((x) => x.version === type.currentVersion)?.fields ?? [];
}

export function newKey(random: () => number = Math.random): string {
	let s = "";
	for (let i = 0; i < 12; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)];
	return s;
}

export function findBlock(blocks: Block[], key: string): Block | undefined {
	return blocks.find((b) => b._key === key);
}

/** The block with `key` gets `data` merged over it; `_type`, `_key` and `_version` never change. */
export function updateBlock(blocks: Block[], key: string, data: Record<string, unknown>): Block[] {
	return blocks.map((b) => (b._key === key ? { ...b, ...data, _type: b._type, _key: b._key, ...(b._version !== undefined ? { _version: b._version } : {}) } : b));
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

/**
 * Insert a new block of `type` after the block with `afterKey` (or at the end).
 * No `_version`: EmDash stamps a new block with the type's active version.
 */
export function insertBlock(blocks: Block[], type: string, afterKey: string | null, data: Record<string, unknown>, key = newKey()): Block[] {
	const block: Block = { ...data, _type: type, _key: key };
	const i = afterKey ? blocks.findIndex((b) => b._key === afterKey) : -1;
	if (i < 0) return [...blocks, block];
	return [...blocks.slice(0, i + 1), block, ...blocks.slice(i + 1)];
}

/**
 * Starting values for a new block: the declared default where there is one,
 * an empty string for text, false for a toggle, an empty list for a repeater,
 * the first option for a select, and nothing at all for a number, image,
 * file, date or rich text (EmDash accepts an absent optional field; it does
 * not accept an empty string or null in a typed one).
 */
export function defaultsFor(type: BlockTypeSchema): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const f of fieldsOf(type)) {
		if (f.defaultValue !== undefined) out[f.slug] = structuredClone(f.defaultValue);
		else if (f.type === "boolean") out[f.slug] = false;
		else if (f.type === "repeater" || f.type === "multiSelect") out[f.slug] = [];
		else if (f.type === "select") {
			const first = f.validation?.options?.[0];
			if (first !== undefined) out[f.slug] = first;
		} else if (f.type === "string" || f.type === "text" || f.type === "url") out[f.slug] = "";
	}
	return out;
}

/**
 * Coerce a raw form value into the field's stored type. Returns `undefined`
 * for "no value" in a typed field so the key is left out of the saved block.
 */
export function coerce(field: FieldSchema, raw: unknown): unknown {
	switch (field.type) {
		case "boolean":
			return raw === true || raw === "on" || raw === "true";
		case "number":
		case "integer": {
			if (raw === "" || raw === null || raw === undefined) return undefined;
			const n = Number(raw);
			if (!Number.isFinite(n)) return undefined;
			return field.type === "integer" ? Math.trunc(n) : n;
		}
		case "select":
			return typeof raw === "string" && raw !== "" ? raw : undefined;
		case "multiSelect":
			return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
		case "repeater":
			return Array.isArray(raw) ? raw : [];
		case "image":
		case "file":
			return raw && typeof raw === "object" ? raw : undefined;
		case "datetime":
			return typeof raw === "string" && raw !== "" ? raw : undefined;
		case "portableText":
			return Array.isArray(raw) ? raw : undefined;
		default:
			return typeof raw === "string" ? raw : raw === null || raw === undefined ? "" : String(raw);
	}
}

/** Drop keys whose value is `undefined` so an absent optional field stays absent. */
export function compact(data: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(data)) if (v !== undefined) out[k] = v;
	return out;
}
