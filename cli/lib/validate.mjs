/**
 * Check entries against the website's content model before anything is
 * sent: unknown fields, unknown section types and section fields, select
 * values outside their options, repeater items with fields the row does not
 * have, values of the wrong shape. The website runs its own validator too;
 * this one says it first, with the file path, so a build is fixed locally.
 *
 * The model is what get_website_schema returns:
 *   collections.items[]   { slug, label, fields: [{ slug, type, required, validation }] }
 *   section_types.items[] { slug, label, description, fields: [{ slug, type, validation, default }] }
 * with validation.options on a select, validation.allowedTypes on a blocks
 * field, validation.subFields on a repeater.
 */

const BLOCK_META = new Set(['_type', '_key', '_version']);

export function indexSchema(schema) {
	const collections = new Map();
	for (const c of schema?.collections?.items ?? []) if (c?.slug) collections.set(c.slug, c);
	const sectionTypes = new Map();
	for (const t of schema?.section_types?.items ?? []) if (t?.slug) sectionTypes.set(t.slug, t);
	return { collections, sectionTypes };
}

const isMedia = (v) => v && typeof v === 'object' && !Array.isArray(v) && (typeof v.id === 'string' || (v.$media && typeof v.$media === 'object'));
const empty = (v) => v === null || v === undefined || v === '';

function checkScalar(type, value, at, errors) {
	if (empty(value)) return;
	switch (type) {
		case 'string':
		case 'text':
		case 'url':
		case 'email':
		case 'portableText':
		case 'richText':
		case 'markdown':
			if (typeof value !== 'string') {
				// A rich-text field may travel as blocks already; a plain field may not.
				if (type === 'portableText' && Array.isArray(value)) return;
				errors.push(`${at}: expected text, got ${describe(value)}`);
			}
			return;
		case 'boolean':
			// The site stores a switch as 1 or 0, so a pull shows numbers; both spellings are fine.
			if (typeof value !== 'boolean' && value !== 0 && value !== 1) errors.push(`${at}: expected true or false, got ${describe(value)}`);
			return;
		case 'integer':
		case 'number':
			if (typeof value !== 'number' && !(typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value))) errors.push(`${at}: expected a number, got ${describe(value)}`);
			return;
		case 'image':
		case 'media':
		case 'file':
			if (!isMedia(value)) errors.push(`${at}: an image is the stored value (from the pull or add_website_image) or { "$media": { "url": "https://...", "alt": "..." } }`);
			else if (value.$media && (typeof value.$media.url !== 'string' || !/^https?:\/\//.test(value.$media.url))) errors.push(`${at}: $media.url must be an http(s) address`);
			else if (value.$media && typeof value.$media.alt !== 'string') errors.push(`${at}: $media.alt is required (what the image shows; "" for a decorative one)`);
			return;
		case 'json':
			return;
		default:
			return;
	}
}

function checkSelect(field, value, at, errors) {
	if (empty(value)) return;
	const options = field.validation?.options ?? field.options;
	if (!Array.isArray(options) || options.length === 0) return;
	if (typeof value !== 'string' || !options.includes(value)) errors.push(`${at}: "${String(value)}" is not one of ${options.map((o) => `"${o}"`).join(', ')}`);
}

function checkRepeater(field, value, at, errors) {
	if (empty(value)) return;
	if (!Array.isArray(value)) {
		errors.push(`${at}: expected a list of items, got ${describe(value)}`);
		return;
	}
	const sub = field.validation?.subFields ?? field.subFields ?? [];
	const known = new Map(sub.map((f) => [f.slug, f]));
	value.forEach((item, i) => {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			errors.push(`${at}[${i}]: expected an object`);
			return;
		}
		for (const [k, v] of Object.entries(item)) {
			if (k === '_key') continue;
			const f = known.get(k);
			if (!f) {
				errors.push(`${at}[${i}].${k}: not a field of this row (fields: ${[...known.keys()].join(', ')})`);
				continue;
			}
			checkField(f, v, `${at}[${i}].${k}`, errors, null);
		}
	});
}

function checkField(field, value, at, errors, ctx) {
	switch (field.type) {
		case 'select':
			checkSelect(field, value, at, errors);
			return;
		case 'repeater':
			checkRepeater(field, value, at, errors);
			return;
		case 'blocks':
			checkBlocks(field, value, at, errors, ctx);
			return;
		case 'reference':
		case 'relation':
			if (!empty(value) && typeof value !== 'string' && !Array.isArray(value)) errors.push(`${at}: a reference is the entry id (or $ref:<id>) as a string`);
			return;
		default:
			checkScalar(field.type, value, at, errors);
	}
}

function checkBlocks(field, value, at, errors, ctx) {
	if (empty(value)) return;
	if (!Array.isArray(value)) {
		errors.push(`${at}: sections are a list`);
		return;
	}
	const allowed = field.validation?.allowedTypes;
	value.forEach((block, i) => {
		const where = `${at}[${i}]`;
		if (!block || typeof block !== 'object' || Array.isArray(block)) {
			errors.push(`${where}: a section is an object with _type`);
			return;
		}
		const type = block._type;
		if (typeof type !== 'string' || !type) {
			errors.push(`${where}: missing _type`);
			return;
		}
		const def = ctx?.sectionTypes.get(type);
		if (!def || (Array.isArray(allowed) && !allowed.includes(type))) {
			errors.push(`${where}: "${type}" is not a section type this field takes (run \`tidysites schema\` for the list)`);
			return;
		}
		const fields = new Map((def.fields ?? []).map((f) => [f.slug, f]));
		for (const [k, v] of Object.entries(block)) {
			if (BLOCK_META.has(k)) continue;
			const f = fields.get(k);
			if (!f) {
				errors.push(`${where} (${type}).${k}: not a field of ${type} (fields: ${[...fields.keys()].join(', ')})`);
				continue;
			}
			checkField(f, v, `${where} (${type}).${k}`, errors, ctx);
		}
	});
}

function describe(v) {
	if (v === null) return 'null';
	if (Array.isArray(v)) return 'a list';
	return typeof v === 'object' ? 'an object' : typeof v;
}

/**
 * Errors for one entry, each prefixed with the file. An empty list means the
 * website's own validator should accept it too (its rules are the same model).
 */
export function validateEntry(collection, entry, model, file = `${collection}/${entry.slug}.json`) {
	const errors = [];
	const col = model.collections.get(collection);
	if (!col) {
		errors.push(`${file}: no collection named "${collection}" on this website (collections: ${[...model.collections.keys()].join(', ')})`);
		return errors;
	}
	const fields = new Map((col.fields ?? []).map((f) => [f.slug, f]));
	for (const f of col.fields ?? []) {
		if (f.required && empty(entry.data[f.slug]) && !(f.slug in entry.data && f.type === 'blocks')) errors.push(`${file}: data.${f.slug} is required`);
	}
	for (const [k, v] of Object.entries(entry.data)) {
		const f = fields.get(k);
		if (!f) {
			errors.push(`${file}: data.${k} is not a field of ${collection} (fields: ${[...fields.keys()].join(', ')})`);
			continue;
		}
		checkField(f, v, `${file}: data.${k}`, errors, model);
	}
	return errors;
}

/** Every entry (by "collection/slug") checked; the errors in file order. */
export function validateAll(local, schema) {
	const model = indexSchema(schema);
	const errors = [];
	for (const key of Object.keys(local).sort()) {
		const i = key.indexOf('/');
		errors.push(...validateEntry(key.slice(0, i), local[key], model));
	}
	return errors;
}
