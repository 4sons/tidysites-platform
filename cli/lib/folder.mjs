/**
 * The folder: a Tidysite's content as files.
 *
 *   <collection>/<slug>.json    { "id", "slug", "status", "updated_at", "data": { ... } }
 *   <collection>/<slug>.css     data.custom_css, as a file (rows: data.css)
 *   rows/<slug>.html            data.html, as a file
 *   .tidysites/                 config, key, the last pull (snapshot), the content model, screenshots
 *
 * A new entry is a new <collection>/<slug>.json with at least { "data": { ... } };
 * the slug is the file name. Everything here is pure: reading and writing the
 * disk is the command's job, so the rules are testable on their own.
 */

export const SIDECARS = {
	default: { css: 'custom_css' },
	rows: { css: 'css', html: 'html' }
};

export const FILE_NAME = /^[a-z0-9][a-z0-9_-]*$/i;

function sidecarsFor(collection) {
	return SIDECARS[collection] ?? SIDECARS.default;
}

/** A pulled entry as the files it becomes: the JSON and its sidecars. */
export function entryToFiles(collection, entry) {
	const name = entry.slug ?? entry.id;
	const data = { ...entry.data };
	const files = {};
	for (const [ext, field] of Object.entries(sidecarsFor(collection))) {
		const v = data[field];
		if (typeof v === 'string' && v.trim()) {
			// Always one newline added on write and one taken on read, so the text round-trips exactly.
			files[`${collection}/${name}.${ext}`] = `${v}\n`;
			delete data[field];
		} else if (v === '' || v === null) {
			delete data[field];
		}
	}
	const json = { id: entry.id, slug: entry.slug ?? null, status: entry.status, updated_at: entry.updated_at ?? null, ...(entry.has_draft ? { has_draft: true } : {}), data };
	files[`${collection}/${name}.json`] = `${JSON.stringify(json, null, '\t')}\n`;
	return files;
}

/** The whole document as files: every entry. The site title and tagline a theme prints are the Business record's, so there is no settings file. */
export function docToFiles(doc) {
	const files = {};
	for (const [collection, entries] of Object.entries(doc.content ?? {})) {
		for (const e of entries) Object.assign(files, entryToFiles(collection, e));
	}
	return files;
}

/**
 * One entry read back from its JSON text and the sidecar texts beside it
 * ({ css?, html? }). Throws with a message that names the file.
 */
export function filesToEntry(collection, name, jsonText, sidecars = {}) {
	const file = `${collection}/${name}.json`;
	let parsed;
	try {
		parsed = JSON.parse(jsonText);
	} catch (e) {
		throw new Error(`${file}: not valid JSON (${e.message})`);
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${file}: must be an object with a data field`);
	if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) throw new Error(`${file}: needs "data": { ... }`);
	if (parsed.slug != null && parsed.slug !== name) throw new Error(`${file}: slug "${parsed.slug}" does not match the file name; rename the file or the slug`);
	if (!FILE_NAME.test(name)) throw new Error(`${file}: the file name is the slug; use letters, digits, - or _`);
	const data = { ...parsed.data };
	for (const [ext, field] of Object.entries(sidecarsFor(collection))) {
		const text = sidecars[ext];
		if (typeof text === 'string') {
			if (typeof data[field] === 'string' && data[field] !== '') throw new Error(`${file}: "${field}" is set both in the JSON and in ${collection}/${name}.${ext}; keep one`);
			data[field] = text.endsWith('\n') ? text.slice(0, -1) : text;
		}
	}
	const status = parsed.status === 'draft' ? 'draft' : parsed.status === 'published' || parsed.status === undefined ? 'published' : null;
	if (status === null) throw new Error(`${file}: status is published or draft`);
	return {
		id: typeof parsed.id === 'string' && parsed.id ? parsed.id : name,
		slug: name,
		status,
		updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : null,
		data
	};
}

/** The snapshot kept from a pull: what the site had, by "collection/slug". */
export function snapshotOf(doc) {
	const entries = {};
	for (const [collection, list] of Object.entries(doc.content ?? {})) {
		for (const e of list) entries[`${collection}/${e.slug ?? e.id}`] = { id: e.id, status: e.status, updated_at: e.updated_at ?? null, data: e.data };
	}
	return { pulled_at: doc.site?.exported_at ?? new Date().toISOString(), site: doc.site ?? null, settings: doc.settings ?? {}, collections: (doc.collections ?? []).map((c) => c.slug), entries };
}

function stable(value) {
	if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
	if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
	return JSON.stringify(value);
}

/** An empty field and a missing one say the same thing to a push (the site keeps what it has). */
function bare(data) {
	const out = {};
	for (const [k, v] of Object.entries(data ?? {})) if (v !== null && v !== '' && v !== undefined) out[k] = v;
	return out;
}

/** Whether two entries would write the same thing. */
export function sameEntry(a, b) {
	return a.status === b.status && stable(bare(a.data)) === stable(bare(b.data));
}

/**
 * Local entries (by "collection/slug") against the snapshot: what a push
 * would create, update, and (with prune) remove. Only collections the
 * snapshot covered can report removals; a collection never pulled is new.
 */
export function diffEntries(local, snapshot) {
	const out = { created: [], updated: [], removed: [], unchanged: [] };
	for (const [key, entry] of Object.entries(local)) {
		const was = snapshot.entries[key];
		if (!was) out.created.push(key);
		else if (!sameEntry(entry, was)) out.updated.push(key);
		else out.unchanged.push(key);
	}
	for (const key of Object.keys(snapshot.entries)) if (!local[key]) out.removed.push(key);
	out.created.sort();
	out.updated.sort();
	out.removed.sort();
	return out;
}

/** The document a push sends for the given keys, with expect from the snapshot. */
export function pushDocument(local, snapshot, { keys, removeKeys = [], settings = null }) {
	const content = {};
	const expect = {};
	for (const key of keys) {
		const [collection, slug] = splitKey(key);
		const e = local[key];
		const was = snapshot.entries[key];
		// A field taken out of the file is cleared on the site: the site keeps what a push does not name,
		// so the names the snapshot had and the file no longer has go as null.
		const data = { ...e.data };
		if (was?.data) for (const k of Object.keys(was.data)) if (!(k in data) && !emptyValue(was.data[k])) data[k] = null;
		(content[collection] ??= []).push({ id: e.id, slug, status: e.status, data });
		if (was?.updated_at) expect[key] = was.updated_at;
	}
	const remove = {};
	for (const key of removeKeys) {
		const [collection, slug] = splitKey(key);
		(remove[collection] ??= []).push(slug);
		const was = snapshot.entries[key];
		if (was?.updated_at) expect[key] = was.updated_at;
	}
	const doc = {};
	if (settings && Object.keys(settings).length) doc.settings = settings;
	if (Object.keys(content).length) doc.content = content;
	if (Object.keys(remove).length) doc.remove = remove;
	if (Object.keys(expect).length) doc.expect = expect;
	return doc;
}

/** Nothing to clear: null, an empty string, an empty list or an empty object (the website refuses null for a list it stores as []). */
const emptyValue = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

export function splitKey(key) {
	const i = key.indexOf('/');
	return [key.slice(0, i), key.slice(i + 1)];
}

// ---------------------------------------------------------------------------
// Menus: menus/<name>.json, a tree of items; the site keeps a flat list with parent indexes.
// ---------------------------------------------------------------------------

/** The site's flat item list (parentId, sortOrder) as the tree the file holds. */
export function menuTree(items) {
	const byParent = new Map();
	for (const it of [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) {
		const k = it.parentId ?? null;
		(byParent.get(k) ?? byParent.set(k, []).get(k)).push(it);
	}
	const node = (it) => {
		const out = { label: it.label };
		if (it.type === 'custom' || !it.type) out.url = it.customUrl ?? '';
		else {
			out.type = it.type;
			if (it.referenceCollection) out.collection = it.referenceCollection;
			if (it.referenceId) out.id = it.referenceId;
		}
		if (it.titleAttr) out.title = it.titleAttr;
		if (it.target) out.target = it.target;
		if (it.cssClasses) out.classes = it.cssClasses;
		const kids = byParent.get(it.id) ?? [];
		if (kids.length) out.children = kids.map(node);
		return out;
	};
	return (byParent.get(null) ?? []).map(node);
}

/** The tree flattened to what menu_set_items takes: each child names its parent's index. */
export function menuItems(tree) {
	const out = [];
	const walk = (nodes, parentIndex) => {
		for (const n of nodes) {
			if (!n || typeof n.label !== 'string' || !n.label) throw new Error('every menu item needs a label');
			const item = { label: n.label, type: n.url !== undefined || !n.type ? 'custom' : n.type };
			if (item.type === 'custom') item.customUrl = n.url ?? '#';
			if (n.collection) item.referenceCollection = n.collection;
			if (n.id) item.referenceId = n.id;
			if (n.title) item.titleAttr = n.title;
			if (n.target) item.target = n.target;
			if (n.classes) item.cssClasses = n.classes;
			if (parentIndex !== null) item.parentIndex = parentIndex;
			out.push(item);
			if (Array.isArray(n.children) && n.children.length) walk(n.children, out.length - 1);
		}
	};
	walk(tree, null);
	return out;
}
