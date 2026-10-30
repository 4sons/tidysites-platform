#!/usr/bin/env node
/**
 * tidysites: a Tidysites website as files.
 *
 *   init <site_id> --host <url> --key <key>   connect this folder to a website, then pull
 *   pull [--collections a,b]                  the website's content to files
 *   status                                    what changed here since the pull
 *   validate                                  check the files against the content model
 *   push [--prune] [--force] [--dry]          write the changes back, then pull
 *   shot <path|url> [--mobile] [--tablet] [--desktop] [--wide] [--all] [--first-screen]   screenshot to .tidysites/shots (none = desktop and mobile); a tall page comes in 1600px bands
 *   measure <path|url> [--mobile] [--tablet] [--desktop] [--wide] [--all] [--full]   the computed type and boxes of a page: the numbers to style to and diff
 *   redirect [add <old> <new> | rm <old>]      the website's redirects (an old address that must keep working goes here)
 *   pages                                     every address the website renders
 *   page <path> [--html]                      the rendered page, section by section
 *   schema [name]                             section types and layouts, or one type's or collection's fields
 *   gallery [type]                            screenshot of every section type in this theme, or the first screen of one type
 *   fetch <url> [--out dir]                   a page of the site being ported: cleaned HTML and its outline
 *   rm <collection>/<slug> ...                 delete entry files (globs allowed: services/*); push --prune then removes them from the website
 *   publish --yes                             the live site becomes a copy of the preview site (refused for a site live on the client's own domain: the person publishes that)
 *
 * The site is the remote: pull, edit, push. A push that would overwrite an
 * entry changed on the website since the pull is refused until you pull
 * again (or say --force).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { callTool, ApiError } from '../lib/api.mjs';
import { diffEntries, entryToFiles, filesToEntry, FILE_NAME, menuItems, menuTree, pushDocument, sameEntry, snapshotOf, SIDECARS } from '../lib/folder.mjs';
import { validateAll, indexSchema } from '../lib/validate.mjs';
import { cleanHtml, cssSummary, fetchPage, outline, outlineText } from '../lib/fetch.mjs';

const META = '.tidysites';
const argv = process.argv.slice(2);
const command = argv[0];
const flags = {};
const positional = [];
for (let i = 1; i < argv.length; i++) {
	const a = argv[i];
	if (a.startsWith('--')) {
		const [k, inline] = a.slice(2).split('=');
		if (inline !== undefined) flags[k] = inline;
		else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
		else flags[k] = true;
	} else positional.push(a);
}

const say = (...a) => console.log(...a);
const fail = (msg, code = 1) => {
	console.error(msg);
	process.exit(code);
};

function root() {
	let dir = resolve(flags.dir ?? process.cwd());
	for (;;) {
		if (existsSync(join(dir, META, 'config.json'))) return dir;
		const up = dirname(dir);
		if (up === dir) return resolve(flags.dir ?? process.cwd());
		dir = up;
	}
}

function config(required = true) {
	const dir = root();
	const path = join(dir, META, 'config.json');
	if (!existsSync(path)) {
		if (required) fail(`Not a Tidysites folder (no ${META}/config.json). Run \`tidysites init <site_id> --host <url> --key <key>\` first; the connector's connect_tidysites_cli tool prints that command.`);
		return { dir, cfg: null };
	}
	const cfg = JSON.parse(readFileSync(path, 'utf8'));
	const keyPath = join(dir, META, 'key');
	cfg.key = process.env.TIDYSITES_KEY || (existsSync(keyPath) ? readFileSync(keyPath, 'utf8').trim() : '');
	if (!cfg.key) fail(`No credential: put it in ${META}/key or TIDYSITES_KEY.`);
	return { dir, cfg };
}

function writeFiles(dir, files) {
	for (const [rel, content] of Object.entries(files)) {
		const p = join(dir, rel);
		mkdirSync(dirname(p), { recursive: true });
		writeFileSync(p, content);
	}
}

/** Every entry in the folder, by "collection/slug", reading sidecars beside each JSON. */
function readLocal(dir, only = null) {
	const local = {};
	const problems = [];
	for (const name of readdirSync(dir)) {
		if (name.startsWith('.') || name === 'node_modules') continue;
		const colDir = join(dir, name);
		if (!statSync(colDir).isDirectory()) continue;
		if (!/^[a-z][a-z0-9_]*$/.test(name) || name === 'menus') continue;
		if (only && !only.includes(name)) continue;
		const sidecarExts = Object.keys(SIDECARS[name] ?? SIDECARS.default);
		for (const file of readdirSync(colDir)) {
			if (!file.endsWith('.json')) continue;
			const slug = file.slice(0, -5);
			if (!FILE_NAME.test(slug)) {
				problems.push(`${name}/${file}: the file name is the slug; use letters, digits, - or _`);
				continue;
			}
			const sidecars = {};
			for (const ext of sidecarExts) {
				const p = join(colDir, `${slug}.${ext}`);
				if (existsSync(p)) sidecars[ext] = readFileSync(p, 'utf8');
			}
			try {
				local[`${name}/${slug}`] = filesToEntry(name, slug, readFileSync(join(colDir, file), 'utf8'), sidecars);
			} catch (e) {
				problems.push(e.message);
			}
		}
	}
	return { local, problems };
}

function readJson(path, fallback = null) {
	return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
}

function describeError(e) {
	let msg = e.message;
	if (e.details?.conflicts) {
		msg += '\n' + e.details.conflicts.map((c) => `  ${c.collection}/${c.slug}: ${c.kind === 'changed' ? `changed on the website (${c.site_updated_at})` : c.kind === 'gone' ? 'removed on the website' : 'already exists on the website'}`).join('\n');
		msg += '\n\nRun `tidysites pull` to take the website\'s version (a file you changed here is kept and shows as changed against the new snapshot), or push --force to overwrite the website.';
	} else if (e.details) msg += `\n${JSON.stringify(e.details, null, 2).slice(0, 4000)}`;
	return msg;
}

async function tool(cfg, name, args) {
	try {
		return await callTool(cfg, name, args);
	} catch (e) {
		if (e instanceof ApiError) fail(describeError(e));
		throw e;
	}
}

/** The site's menus as trees, by name. */
async function readMenus(cfg) {
	const { json: list } = await tool(cfg, 'call_website_site_tool', { site_id: cfg.site, tool: 'menu_list', arguments: {} });
	const rows = list?.result ?? list?.menus ?? [];
	const menus = {};
	for (const m of Array.isArray(rows) ? rows : []) {
		if (!m?.name) continue;
		const { json: one } = await tool(cfg, 'call_website_site_tool', { site_id: cfg.site, tool: 'menu_get', arguments: { name: m.name } });
		const menu = one?.result ?? one;
		menus[m.name] = { name: m.name, label: menu?.label ?? m.label ?? m.name, items: menuTree(Array.isArray(menu?.items) ? menu.items : []) };
	}
	return menus;
}

function readLocalMenus(dir) {
	const out = {};
	const d = join(dir, 'menus');
	if (!existsSync(d)) return out;
	for (const f of readdirSync(d)) {
		if (!f.endsWith('.json')) continue;
		const name = f.slice(0, -5);
		try {
			const j = JSON.parse(readFileSync(join(d, f), 'utf8'));
			out[name] = { name, label: j.label ?? name, items: Array.isArray(j.items) ? j.items : [] };
		} catch (e) {
			out[name] = { name, error: `menus/${f}: ${e.message}` };
		}
	}
	return out;
}

async function pull({ dir, cfg }, collections = null, { overwrite = new Set(), menus: wantMenus = null } = {}) {
	let want = collections ?? (flags.collections ? String(flags.collections).split(',').map((s) => s.trim()).filter(Boolean) : null);
	// `menus` is not a collection on the website; it is pulled through the site's own menu tools.
	let refreshMenus = wantMenus ?? (want === null || want.includes('menus'));
	if (want) want = want.filter((c) => c !== 'menus');
	if (want && !want.length) {
		await pullMenus({ dir, cfg });
		return;
	}
	const [{ json: doc }, { json: schema }] = await Promise.all([
		tool(cfg, 'pull_website', { site_id: cfg.site, ...(want ? { collections: want.join(',') } : {}) }),
		tool(cfg, 'get_website_schema', { site_id: cfg.site })
	]);
	if (!doc?.content) fail('The pull came back without content.');
	const pulled = new Set(doc.collections.map((c) => c.slug));
	const { local } = readLocal(dir, [...pulled]);
	const prev = readJson(join(dir, META, 'snapshot.json'));
	// A file changed here since the last pull and not pushed yet is kept; the snapshot moves to the
	// website's version underneath it, so status shows the difference and a push carries the new stamp.
	const files = {};
	const kept = [];
	for (const [collection, entries] of Object.entries(doc.content)) {
		for (const e of entries) {
			const key = `${collection}/${e.slug ?? e.id}`;
			const mine = local[key];
			const was = prev?.entries?.[key];
			// An entry this push just wrote is the website's now: its file takes the website's version ($media
			// becomes the stored image, _version appears), whatever the file said a moment ago.
			if (mine && was && !overwrite.has(key) && !sameEntry(mine, was) && !sameEntry(mine, { status: e.status, data: e.data })) {
				kept.push(key);
				continue;
			}
			Object.assign(files, entryToFiles(collection, e));
		}
	}
	let removed = 0;
	for (const key of Object.keys(local)) {
		const [collection, slug] = key.split('/');
		// Only a file the last pull wrote goes; a file you added here and never pushed stays.
		if (prev?.entries?.[key] && !doc.content[collection]?.some((e) => (e.slug ?? e.id) === slug)) {
			for (const ext of ['json', ...Object.keys(SIDECARS[collection] ?? SIDECARS.default)]) {
				const p = join(dir, collection, `${slug}.${ext}`);
				if (existsSync(p)) rmSync(p);
			}
			removed++;
		}
	}
	writeFiles(dir, files);
	const snap = snapshotOf(doc);
	if (refreshMenus) {
		const menus = await readMenus(cfg);
		snap.menus = menus;
		const localMenus = readLocalMenus(dir);
		for (const [name, menu] of Object.entries(menus)) {
			const mine = localMenus[name];
			const wasMenu = prev?.menus?.[name];
			if (mine && !mine.error && wasMenu && !overwrite.has(`menus/${name}`) && JSON.stringify(mine.items) !== JSON.stringify(wasMenu.items) && JSON.stringify(mine.items) !== JSON.stringify(menu.items)) {
				kept.push(`menus/${name}`);
				continue;
			}
			writeFiles(dir, { [`menus/${name}.json`]: `${JSON.stringify({ label: menu.label, items: menu.items }, null, '\t')}\n` });
		}
	} else if (prev?.menus) snap.menus = prev.menus;
	if (want && prev) {
		// A partial pull refreshes only its collections in the snapshot.
		for (const [k, v] of Object.entries(prev.entries)) if (!pulled.has(k.split('/')[0])) snap.entries[k] = v;
		snap.settings = prev.settings;
		snap.collections = [...new Set([...(prev.collections ?? []), ...snap.collections])];
	}
	writeFileSync(join(dir, META, 'snapshot.json'), JSON.stringify(snap, null, '\t'));
	writeFileSync(join(dir, META, 'schema.json'), JSON.stringify(schema, null, '\t'));
	const n = doc.collections.reduce((a, c) => a + c.count, 0);
	say(`Pulled ${n} entr${n === 1 ? 'y' : 'ies'} in ${doc.collections.length} collections from ${doc.site.preview_url ?? cfg.site}${removed ? `; ${removed} file${removed === 1 ? '' : 's'} removed (gone on the website)` : ''}.`);
	for (const c of doc.collections.filter((c) => c.count)) say(`  ${c.slug.padEnd(20)} ${c.count}`);
	if (snap.menus) say(`  ${'menus'.padEnd(20)} ${Object.keys(snap.menus).length}`);
	for (const k of kept) say(`  kept your unpushed changes in ${k}`);
}

/** The menus alone: files and the snapshot's menus, the entries untouched. */
async function pullMenus({ dir, cfg }) {
	const snap = readJson(join(dir, META, 'snapshot.json'));
	if (!snap) fail('Nothing pulled yet. Run `tidysites pull`.');
	const menus = await readMenus(cfg);
	for (const [name, menu] of Object.entries(menus)) writeFiles(dir, { [`menus/${name}.json`]: `${JSON.stringify({ label: menu.label, items: menu.items }, null, '\t')}\n` });
	snap.menus = menus;
	writeFileSync(join(dir, META, 'snapshot.json'), JSON.stringify(snap, null, '\t'));
	say(`Pulled ${Object.keys(menus).length} menu${Object.keys(menus).length === 1 ? '' : 's'}.`);
}

function status({ dir }) {
	const snap = readJson(join(dir, META, 'snapshot.json'));
	if (!snap) fail('Nothing pulled yet. Run `tidysites pull`.');
	const { local, problems } = readLocal(dir);
	const d = diffEntries(local, snap);
	const menus = readLocalMenus(dir);
	const menusChanged = [];
	for (const [name, m] of Object.entries(menus)) {
		if (m.error) problems.push(m.error);
		else if (JSON.stringify(m.items) !== JSON.stringify(snap.menus?.[name]?.items ?? null) || m.label !== (snap.menus?.[name]?.label ?? m.label)) menusChanged.push(name);
	}
	return { snap, local, problems, diff: d, menus, menusChanged };
}

function printStatus(s) {
	for (const p of s.problems) say(`! ${p}`);
	for (const k of s.diff.created) say(`+ ${k}`);
	for (const k of s.diff.updated) say(`~ ${k}`);
	for (const k of s.diff.removed) say(`- ${k} (file deleted; push --prune removes it from the website)`);
	for (const m of s.menusChanged) say(`~ menus/${m}`);
	const n = s.diff.created.length + s.diff.updated.length + s.menusChanged.length;
	if (!n && !s.diff.removed.length && !s.problems.length) say(`Nothing changed since the pull (${s.diff.unchanged.length} entries).`);
	return n;
}

function validate({ dir }, local = null) {
	const schema = readJson(join(dir, META, 'schema.json'));
	if (!schema) fail('No content model here yet. Run `tidysites pull`.');
	const read = local ? { local, problems: [] } : readLocal(dir);
	const errors = [...read.problems, ...validateAll(read.local, schema)];
	// The website keeps a section's type with its key: a key that changes type is refused with a bare "internal error", so say it here.
	const snap = readJson(join(dir, META, 'snapshot.json'));
	for (const [key, entry] of Object.entries(read.local)) {
		const before = snap?.entries?.[key]?.data?.sections;
		const after = entry.data?.sections;
		if (!Array.isArray(before) || !Array.isArray(after)) continue;
		const types = new Map(before.filter((b) => b && b._key).map((b) => [b._key, b._type]));
		for (const b of after) if (b && b._key && types.has(b._key) && types.get(b._key) !== b._type) errors.push(`${key}.json: section "${b._key}" was a ${types.get(b._key)} and is now a ${b._type}; a section keeps its type, so give the new one its own _key`);
	}
	return errors;
}

async function push(ctx) {
	const s = status(ctx);
	const errors = validate(ctx, s.local);
	if (errors.length) {
		for (const e of errors) say(`✗ ${e}`);
		fail(`\n${errors.length} problem${errors.length === 1 ? '' : 's'}; nothing pushed.`);
	}
	const only = flags.only ? String(flags.only).split(',') : null;
	const keys = [...s.diff.created, ...s.diff.updated].filter((k) => !only || only.includes(k.split('/')[0]));
	const removeKeys = flags.prune ? s.diff.removed.filter((k) => !only || only.includes(k.split('/')[0])) : [];
	const menus = s.menusChanged.filter((m) => !only || only.includes('menus'));
	if (!keys.length && !removeKeys.length && !menus.length) {
		say('Nothing to push.');
		return;
	}
	const doc = pushDocument(s.local, s.snap, { keys, removeKeys });
	if (flags.force) doc.force = true;
	if (flags.dry) {
		say(`Would push ${keys.length} entr${keys.length === 1 ? 'y' : 'ies'}${removeKeys.length ? `, remove ${removeKeys.length}` : ''}${menus.length ? `, rewrite menu${menus.length === 1 ? '' : 's'} ${menus.join(', ')}` : ''}:`);
		printStatus(s);
		if (flags.json) say(JSON.stringify(doc, null, 2));
		return;
	}
	printStatus(s);
	const touched = [...new Set([...keys, ...removeKeys].map((k) => k.split('/')[0]))];
	if (keys.length || removeKeys.length) {
		let r;
		try {
			({ json: r } = await callTool(ctx.cfg, 'push_website', { site_id: ctx.cfg.site, ...doc }));
		} catch (e) {
			if (!(e instanceof ApiError)) throw e;
			say(describeError(e));
			if (e.status !== 409 && e.status !== 422) {
				// The website writes entry by entry, so a failure part way leaves some of them written.
				say('\nThe website may have taken part of the push. Pulling what it has now; a file of yours that still differs is kept and stays listed in status.');
				await pull(ctx, touched);
			}
			process.exit(1);
		}
		say(`Pushed: ${r.content.created} created, ${r.content.updated} updated${r.images ? `, ${r.images} image${r.images === 1 ? '' : 's'} added` : ''}${r.images_reused ? `, ${r.images_reused} already in the library` : ''}${r.removed ? `, ${r.removed} removed` : ''}.`);
		if (r.missing?.length) say(`Not found to remove: ${r.missing.map((m) => `${m.collection}/${m.slug}`).join(', ')}`);
	}
	for (const name of menus) {
		const m = s.menus[name];
		let items;
		try {
			items = menuItems(m.items);
		} catch (e) {
			fail(`menus/${name}.json: ${e.message}`);
		}
		await tool(ctx.cfg, 'call_website_site_tool', { site_id: ctx.cfg.site, tool: 'menu_set_items', arguments: { name, items } });
		say(`Menu ${name}: ${items.length} item${items.length === 1 ? '' : 's'} written.`);
	}
	// Refresh only what went, and take the website's version of exactly those entries; every other file stays as it is.
	const pushed = new Set([...keys, ...menus.map((m) => `menus/${m}`)]);
	if (touched.length) await pull(ctx, touched, { overwrite: pushed, menus: menus.length > 0 });
	else if (menus.length) await pullMenus(ctx);
}

async function shot(ctx, target = positional[0] ?? '/', opts = {}) {
	const isUrl = /^https?:\/\//.test(target);
	// --desktop, --mobile, --tablet, --wide, any of them together; --all for every width; none = desktop and mobile.
	const picked = ['desktop', 'mobile', 'tablet', 'wide'].filter((v) => flags[v]);
	const view = flags.all ? 'all' : picked.length ? picked.join(',') : (opts.view ?? 'both');
	const args = { site_id: ctx.cfg.site, view, full_page: !(flags['first-screen'] || opts.firstScreen), ...(isUrl ? { url: target } : { path: target, site: flags.live ? 'live' : 'preview' }) };
	const { json, images } = await tool(ctx.cfg, 'screenshot_website', args);
	const outDir = join(ctx.dir, META, 'shots');
	mkdirSync(outDir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(4, 18);
	const base = (opts.name ?? (isUrl ? new URL(target).hostname + new URL(target).pathname : target)).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
	const named = Array.isArray(json?.captures) ? json.captures : [];
	// The pictures come in the order of the captures: a tall page as its bands (top to bottom), a short one whole.
	const slots = named.filter((c) => !c.error).flatMap((c) => (Array.isArray(c.bands) && c.bands.length ? c.bands.map((b) => ({ view: c.view, band: b.index })) : [{ view: c.view, band: 0 }]));
	images.forEach((img, i) => {
		const v = slots[i]?.view ?? (view === 'both' ? ['desktop', 'mobile'][i] : view === 'all' ? ['desktop', 'mobile', 'tablet', 'wide'][i] : view.split(',')[i] ?? view);
		const band = slots[i]?.band ? `-band-${String(slots[i].band).padStart(2, '0')}` : '';
		const p = join(outDir, `${base}-${v}-${stamp}${band}.${img.mimeType.includes('png') ? 'png' : 'jpg'}`);
		writeFileSync(p, Buffer.from(img.base64, 'base64'));
		say(relative(process.cwd(), p));
	});
	if (!images.length) say(json ? JSON.stringify(json).slice(0, 500) : 'No image came back.');
}

/** The computed type and boxes of a page, old or new, at one or several widths: the numbers a port styles to. */
async function measure(ctx) {
	const target = positional[0] ?? '/';
	const isUrl = /^https?:\/\//.test(target);
	const picked = ['desktop', 'mobile', 'tablet', 'wide'].filter((v) => flags[v]);
	const view = flags.all ? 'all' : picked.length ? picked.join(',') : 'desktop';
	const args = { site_id: ctx.cfg.site, view, ...(isUrl ? { url: target } : { path: target, site: flags.live ? 'live' : 'preview' }) };
	const { json } = await tool(ctx.cfg, 'measure_website', args);
	if (!json?.views) fail('No measurements came back.');
	const outDir = join(ctx.dir, META, 'measures');
	mkdirSync(outDir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(4, 18);
	const base = (isUrl ? new URL(target).hostname + new URL(target).pathname : target).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
	for (const v of json.views) {
		if (v.error) { say(`${v.view}: ${v.error}`); continue; }
		const file = join(outDir, `${base}-${v.view}-${stamp}.json`);
		writeFileSync(file, JSON.stringify(v, null, '\t'));
		say(`\n${v.view} (${v.width}px wide, page ${v.page_height}px tall; fonts: ${v.fonts.join(', ')})  →  ${relative(process.cwd(), file)}`);
		const kinds = flags.kind ? String(flags.kind).split(',') : ['box', 'text', 'button', 'image'];
		const items = v.items.filter((it) => kinds.includes(it.kind)).filter((it) => it.kind !== 'text' || /^h[1-6]$/.test(it.tag) || flags.all || flags.text || it.font?.size >= 16 || /^(p|li|a)$/.test(it.tag));
		const shown = flags.full ? items : items.slice(0, 120);
		for (const it of shown) {
			const where = `y${String(it.y).padStart(5)} x${String(it.x).padStart(4)} ${String(it.width).padStart(4)}×${String(it.height).padEnd(4)}`;
			if (it.kind === 'box') say(`  ${where} ▭ ${it.selector}  pad ${it.padding.join('/')}  bg ${it.background}${it.text ? `  "${it.text}"` : ''}`);
			else if (it.kind === 'image') say(`  ${where} ▣ ${it.selector}  ${it.natural?.width}×${it.natural?.height} natural${it.radius && it.radius !== '0px' ? `  radius ${it.radius}` : ''}  ${it.text ? `"${it.text}"` : it.src?.split('/').pop()}`);
			else {
				const f = it.font;
				const type = `${f.size}px/${f.line_height ?? 'auto'} w${f.weight} ${f.family}${f.letter_spacing !== 'normal' ? ` ls ${f.letter_spacing}` : ''}${f.transform !== 'none' ? ` ${f.transform}` : ''} ${f.color}`;
				say(`  ${where} ${it.kind === 'button' ? '▶' : it.tag.padEnd(2)} ${type}${it.kind === 'button' ? `  pad ${it.padding.join('/')} bg ${it.background} r ${it.radius}` : ''}  "${it.text}"`);
			}
		}
		if (items.length > shown.length) say(`  … ${items.length - shown.length} more in the file (--full prints all)`);
	}
}

/** The website's redirects: list them, add one, remove one. They ship with the next publish. */
async function redirect(ctx) {
	const sub = positional[0];
	if (sub === 'add') {
		const [, from, to] = positional;
		if (!from || !to) fail('Usage: tidysites redirect add <old path> <new path or url>');
		const { json } = await tool(ctx.cfg, 'add_website_redirect', { site_id: ctx.cfg.site, source: from, destination: to });
		say(json ? `${from} → ${to}` : 'Added.');
		return;
	}
	if (sub === 'rm' || sub === 'remove') {
		const from = positional[1];
		if (!from) fail('Usage: tidysites redirect rm <old path>');
		const { json: list } = await tool(ctx.cfg, 'list_website_redirects', { site_id: ctx.cfg.site });
		const rows = list?.redirects ?? list?.items ?? [];
		const hit = rows.find((r) => (r.source ?? r.from) === from || (r.source ?? r.from) === from.replace(/\/$/, '') || (r.source ?? r.from) === `${from}/`);
		if (!hit) fail(`No redirect from ${from}.`);
		await tool(ctx.cfg, 'remove_website_redirect', { site_id: ctx.cfg.site, redirect_id: hit.id });
		say(`Removed ${from}.`);
		return;
	}
	const { json } = await tool(ctx.cfg, 'list_website_redirects', { site_id: ctx.cfg.site });
	const rows = json?.redirects ?? json?.items ?? [];
	if (!rows.length) { say('No redirects.'); return; }
	for (const r of rows) say(`${(r.source ?? r.from ?? '').padEnd(44)} → ${r.destination ?? r.to ?? ''}${r.status && r.status !== 301 ? `  (${r.status})` : ''}`);
}

async function pages(ctx) {
	const { json } = await tool(ctx.cfg, 'list_website_pages', { site_id: ctx.cfg.site });
	const list = json?.pages ?? json?.items ?? [];
	for (const p of list) say(`${(p.path ?? '').padEnd(40)} ${p.kind ?? ''}${p.collection ? ` ${p.collection}/${p.slug ?? ''}` : ''}  ${p.title ?? ''}`);
	if (!list.length) say(JSON.stringify(json).slice(0, 800));
}

async function page(ctx) {
	const path = positional[0] ?? '/';
	const { json } = await tool(ctx.cfg, 'get_website_page', { site_id: ctx.cfg.site, path });
	if (!json) fail('No page came back.');
	say(`${json.title ?? ''}${json.h1 ? `  (H1: ${json.h1})` : ''}`);
	const sections = json.sections ?? json.blocks ?? [];
	for (const s of sections) say(`  ${String(s.key ?? s._key ?? '').padEnd(14)} ${String(s.type ?? s._type ?? '').padEnd(12)} ${(s.html ?? '').length} chars${s.heading ? `  ${s.heading}` : ''}`);
	if (flags.html) {
		const outDir = join(ctx.dir, META, 'pages');
		mkdirSync(outDir, { recursive: true });
		const p = join(outDir, `${path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'}.html`);
		writeFileSync(p, [json.header ?? '', ...sections.map((s) => `<!-- ${s.key ?? ''} ${s.type ?? ''} -->\n${s.html ?? ''}`), json.footer ?? ''].join('\n\n'));
		say(relative(process.cwd(), p));
	}
}

function schema(ctx) {
	const s = readJson(join(ctx.dir, META, 'schema.json'));
	if (!s) fail('No content model here yet. Run `tidysites pull`.');
	const model = indexSchema(s);
	const name = positional[0];
	const fieldLine = (f) => {
		const opts = f.validation?.options ?? f.options;
		const sub = f.validation?.subFields ?? f.subFields;
		let line = `  ${f.slug.padEnd(22)} ${f.type}${f.required ? ' (required)' : ''}${f.default !== undefined ? `  default: ${JSON.stringify(f.default)}` : ''}`;
		if (f.label && f.label !== f.slug) line += `  — ${f.label}`;
		if (opts) line += `\n${' '.repeat(25)}one of: ${opts.join(' | ')}`;
		if (sub) line += `\n${' '.repeat(25)}items: ${sub.map((x) => `${x.slug}:${x.type}${x.options ? `(${x.options.join('|')})` : ''}`).join(', ')}`;
		if (f.validation?.allowedTypes) line += `\n${' '.repeat(25)}section types: ${f.validation.allowedTypes.join(', ')}`;
		return line;
	};
	if (!name) {
		say('Section types (a page\'s sections list holds these; `tidysites schema <type>` for the fields):');
		for (const t of model.sectionTypes.values()) say(`  ${t.slug.padEnd(16)} ${t.description ?? t.label ?? ''}`);
		say('\nCollections (`tidysites schema <collection>` for the fields):');
		for (const c of model.collections.values()) say(`  ${c.slug.padEnd(20)} ${c.label ?? ''}${c.description ? ` — ${c.description}` : ''}`);
		return;
	}
	const t = model.sectionTypes.get(name);
	const c = model.collections.get(name);
	if (!t && !c) fail(`No section type or collection named "${name}".`);
	if (t) {
		say(`Section type ${t.slug}: ${t.description ?? ''}`);
		for (const f of t.fields ?? []) say(fieldLine(f));
	}
	if (c) {
		say(`Collection ${c.slug}: ${c.description ?? c.label ?? ''}`);
		for (const f of c.fields ?? []) say(fieldLine(f));
	}
}

async function fetchCmd(ctx) {
	const url = positional[0];
	if (!url) fail('Usage: tidysites fetch <url> [--out dir]');
	const outDir = resolve(flags.out ?? join(ctx?.dir ?? process.cwd(), META, 'source'));
	mkdirSync(outDir, { recursive: true });
	const { url: final, html } = await fetchPage(url);
	const o = outline(html, final);
	const base = (new URL(final).pathname.replace(/\/$/, '').split('/').pop() || 'home').replace(/[^a-z0-9]+/gi, '-');
	const cssTexts = [];
	for (const href of o.stylesheets.slice(0, 8)) {
		try {
			const r = await fetch(href, { headers: { 'user-agent': 'Mozilla/5.0' } });
			if (r.ok) {
				const css = await r.text();
				cssTexts.push(css);
				writeFileSync(join(outDir, `${base}-${cssTexts.length}.css`), css);
			}
		} catch {
			/* a stylesheet that will not download is not the port's problem */
		}
	}
	// A page that carries its styles inline (Wix, many builders) has no stylesheet to download: read the <style> blocks too.
	const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
	if (inline.trim()) { cssTexts.push(inline); writeFileSync(join(outDir, `${base}-inline.css`), inline); }
	if (cssTexts.length) o.css = cssSummary(cssTexts.join('\n'));
	writeFileSync(join(outDir, `${base}.raw.html`), html);
	writeFileSync(join(outDir, `${base}.html`), cleanHtml(html));
	writeFileSync(join(outDir, `${base}.outline.json`), JSON.stringify(o, null, '\t'));
	const text = outlineText(o);
	writeFileSync(join(outDir, `${base}.outline.txt`), text);
	say(text);
	say(`Saved to ${relative(process.cwd(), outDir)}/: ${base}.html (cleaned), ${base}.raw.html, ${base}.outline.json${cssTexts.length ? `, ${cssTexts.length} stylesheet${cssTexts.length === 1 ? '' : 's'}` : ''}`);
}

/**
 * Delete entry files inside the folder, with their sidecars, so nobody has to reach for the shell's rm (which a
 * harness may stop to ask about). Takes collection/slug paths; a trailing * takes every entry of the collection.
 */
function rmCmd({ dir }) {
	if (!positional.length) fail('Usage: tidysites rm <collection>/<slug> [...]   (services/* for every entry of a collection)');
	let removed = 0;
	for (const arg of positional) {
		const m = /^([a-z][a-z0-9_]*)\/(\*|[A-Za-z0-9][A-Za-z0-9_-]*)(?:\.json)?$/.exec(arg.replace(/^\.\//, ''));
		if (!m) fail(`${arg}: write collection/slug or collection/*`);
		const [, collection, slug] = m;
		const colDir = join(dir, collection);
		if (!existsSync(colDir)) { say(`${collection}/: no such collection folder`); continue; }
		const slugs = slug === '*' ? readdirSync(colDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [slug];
		for (const sl of slugs) {
			let hit = false;
			for (const ext of ['json', ...Object.keys(SIDECARS[collection] ?? SIDECARS.default)]) {
				const f = join(colDir, `${sl}.${ext}`);
				if (existsSync(f)) { rmSync(f); hit = true; }
			}
			if (hit) { removed++; say(`- ${collection}/${sl}`); } else say(`${collection}/${sl}: no such entry file`);
		}
	}
	say(`${removed} entr${removed === 1 ? 'y' : 'ies'} removed from the folder; \`tidysites push --prune\` removes them from the website.`);
}

async function publish(ctx) {
	if (!flags.yes) fail('Publishing makes the live site a copy of the preview site. Look at it first (`tidysites shot /`), then run `tidysites publish --yes`.');
	// A website live on the client's own domain is never published from here: the website refuses (409 live_domain) and says who may.
	const { json, text } = await tool(ctx.cfg, 'publish_website', { site_id: ctx.cfg.site });
	say(json ? JSON.stringify(json, null, 2) : text);
}

function help() {
	say(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(2, 20).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
	say(`\nFiles:\n  <collection>/<slug>.json      { "id", "slug", "status", "updated_at", "data": {...} }; a new entry is a new file with "data"\n  <collection>/<slug>.css       data.custom_css as a file (rows: data.css); rows/<slug>.html is data.html\n  menus/<name>.json             a menu as a tree: { label, items: [{ label, url, children: [...] }] }\n  ${META}/                   config, key, the last pull, the content model, screenshots\n\nA field taken out of a file is cleared on the website at the next push; a file you changed here is never overwritten by a pull.\nImages: an image field or a Columns image slot takes { "$media": { "url": "https://...", "alt": "..." } }; the push fetches it into the library.\nReferences: a record names another by its id, or "$ref:<slug-or-id>" for one in the same push.`);
}

async function main() {
	switch (command) {
		case 'init': {
			const site = positional[0];
			const host = flags.host;
			const key = flags.key || process.env.TIDYSITES_KEY;
			if (!site || !host || !key) fail('Usage: tidysites init <site_id> --host <url> --key <key> [--dir folder]');
			const dir = resolve(flags.dir ?? process.cwd());
			mkdirSync(join(dir, META), { recursive: true });
			writeFileSync(join(dir, META, 'config.json'), `${JSON.stringify({ host: String(host).replace(/\/+$/, ''), site }, null, '\t')}\n`);
			writeFileSync(join(dir, META, 'key'), `${key}\n`, { mode: 0o600 });
			writeFileSync(join(dir, META, '.gitignore'), 'key\nshots/\nsource/\npages/\n');
			say(`Connected ${relative(process.cwd(), dir) || '.'} to ${site} on ${host}.`);
			await pull(config());
			return;
		}
		case 'pull':
			return pull(config());
		case 'status': {
			printStatus(status(config()));
			return;
		}
		case 'validate': {
			const errors = validate(config());
			if (errors.length) {
				for (const e of errors) say(`✗ ${e}`);
				fail(`\n${errors.length} problem${errors.length === 1 ? '' : 's'}.`);
			}
			say('Every file fits the content model.');
			return;
		}
		case 'push':
			return push(config());
		case 'shot':
			return shot(config());
		case 'gallery': {
			// One type at a time is readable; the whole gallery is a very tall picture.
			const type = positional[0];
			return shot(config(), `/_tidy/gallery${type ? `#${type}` : ''}`, { view: 'desktop', name: type ? `gallery-${type}` : 'gallery', firstScreen: Boolean(type) });
		}
		case 'measure':
			return measure(config());
		case 'redirect':
		case 'redirects':
			return redirect(config());
		case 'pages':
			return pages(config());
		case 'page':
			return page(config());
		case 'schema':
			return schema(config());
		case 'fetch':
			return fetchCmd(config(false));
		case 'rm':
			return rmCmd(config());
		case 'publish':
			return publish(config());
		case 'help':
		case '--help':
		case '-h':
		case undefined:
			return help();
		default:
			fail(`Unknown command "${command}". \`tidysites help\` lists them.`);
	}
}

main().catch((e) => fail(e?.stack ?? String(e)));
