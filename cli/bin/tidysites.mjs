#!/usr/bin/env node
/**
 * tidysites: a Tidysites website as files.
 *
 *   init <site_id> --host <url> --key <key>   connect this folder to a website, then pull
 *   pull [--collections a,b]                  the website's content to files
 *   status                                    what changed here since the pull
 *   validate                                  check the files against the content model
 *   push [--prune] [--force] [--dry]          write the changes back, then pull
 *   shot <path|url> [--mobile|--desktop] [--first-screen]   screenshot to .tidysites/shots
 *   pages                                     every address the website renders
 *   page <path> [--html]                      the rendered page, section by section
 *   schema [name]                             section types and layouts, or one type's or collection's fields
 *   gallery                                   screenshot of every section type in this theme
 *   fetch <url> [--out dir]                   a page of the site being ported: cleaned HTML and its outline
 *   publish --yes                             the live site becomes a copy of the preview site
 *
 * The site is the remote: pull, edit, push. A push that would overwrite an
 * entry changed on the website since the pull is refused until you pull
 * again (or say --force).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { callTool, ApiError } from '../lib/api.mjs';
import { diffEntries, docToFiles, filesToEntry, FILE_NAME, pushDocument, snapshotOf, SIDECARS } from '../lib/folder.mjs';
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
		if (!/^[a-z][a-z0-9_]*$/.test(name)) continue;
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

async function tool(cfg, name, args) {
	try {
		return await callTool(cfg, name, args);
	} catch (e) {
		if (e instanceof ApiError) {
			let msg = e.message;
			if (e.details?.conflicts) {
				msg += '\n' + e.details.conflicts.map((c) => `  ${c.collection}/${c.slug}: ${c.kind === 'changed' ? `changed on the website (${c.site_updated_at})` : c.kind === 'gone' ? 'removed on the website' : 'already exists on the website'}`).join('\n');
				msg += '\n\nRun `tidysites pull` to take the website\'s version (your files are overwritten; copy what you need first), or push --force to overwrite the website.';
			} else if (e.details) msg += `\n${JSON.stringify(e.details, null, 2).slice(0, 4000)}`;
			fail(msg);
		}
		throw e;
	}
}

async function pull({ dir, cfg }, collections = null) {
	const want = collections ?? (flags.collections ? String(flags.collections).split(',').map((s) => s.trim()).filter(Boolean) : null);
	const [{ json: doc }, { json: schema }] = await Promise.all([
		tool(cfg, 'pull_website', { site_id: cfg.site, ...(want ? { collections: want.join(',') } : {}) }),
		tool(cfg, 'get_website_schema', { site_id: cfg.site })
	]);
	if (!doc?.content) fail('The pull came back without content.');
	const files = docToFiles(doc);
	// The folder mirrors the website for the collections pulled: files for entries it no longer has go.
	const pulled = new Set(doc.collections.map((c) => c.slug));
	const { local } = readLocal(dir, [...pulled]);
	const prev = readJson(join(dir, META, 'snapshot.json'));
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
}

function status({ dir }) {
	const snap = readJson(join(dir, META, 'snapshot.json'));
	if (!snap) fail('Nothing pulled yet. Run `tidysites pull`.');
	const { local, problems } = readLocal(dir);
	const d = diffEntries(local, snap);
	return { snap, local, problems, diff: d, settings: null, settingsChanged: false };
}

function printStatus(s) {
	for (const p of s.problems) say(`! ${p}`);
	for (const k of s.diff.created) say(`+ ${k}`);
	for (const k of s.diff.updated) say(`~ ${k}`);
	for (const k of s.diff.removed) say(`- ${k} (file deleted; push --prune removes it from the website)`);
	const n = s.diff.created.length + s.diff.updated.length;
	if (!n && !s.diff.removed.length && !s.problems.length) say(`Nothing changed since the pull (${s.diff.unchanged.length} entries).`);
	return n;
}

function validate({ dir }, local = null) {
	const schema = readJson(join(dir, META, 'schema.json'));
	if (!schema) fail('No content model here yet. Run `tidysites pull`.');
	const read = local ? { local, problems: [] } : readLocal(dir);
	const errors = [...read.problems, ...validateAll(read.local, schema)];
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
	const settings = null;
	if (!keys.length && !removeKeys.length) {
		say('Nothing to push.');
		return;
	}
	const doc = pushDocument(s.local, s.snap, { keys, removeKeys, settings });
	if (flags.force) doc.force = true;
	if (flags.dry) {
		say(`Would push ${keys.length} entr${keys.length === 1 ? 'y' : 'ies'}${removeKeys.length ? `, remove ${removeKeys.length}` : ''}:`);
		printStatus(s);
		if (flags.json) say(JSON.stringify(doc, null, 2));
		return;
	}
	printStatus(s);
	const { json: r } = await tool(ctx.cfg, 'push_website', { site_id: ctx.cfg.site, ...doc });
	say(`Pushed: ${r.content.created} created, ${r.content.updated} updated${r.images ? `, ${r.images} image${r.images === 1 ? '' : 's'} added` : ''}${r.removed ? `, ${r.removed} removed` : ''}.`);
	if (r.missing?.length) say(`Not found to remove: ${r.missing.map((m) => `${m.collection}/${m.slug}`).join(', ')}`);
	await pull(ctx, null);
}

async function shot(ctx, target = positional[0] ?? '/', opts = {}) {
	const isUrl = /^https?:\/\//.test(target);
	const view = flags.mobile ? 'mobile' : flags.desktop ? 'desktop' : (opts.view ?? 'both');
	const args = { site_id: ctx.cfg.site, view, full_page: !flags['first-screen'], ...(isUrl ? { url: target } : { path: target, site: flags.live ? 'live' : 'preview' }) };
	const { json, images } = await tool(ctx.cfg, 'screenshot_website', args);
	const outDir = join(ctx.dir, META, 'shots');
	mkdirSync(outDir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(4, 15);
	const base = (opts.name ?? (isUrl ? new URL(target).hostname + new URL(target).pathname : target)).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
	const named = Array.isArray(json?.screenshots) ? json.screenshots : [];
	images.forEach((img, i) => {
		const v = named[i]?.view ?? (view === 'both' ? ['desktop', 'mobile'][i] : view);
		const p = join(outDir, `${base}-${v}-${stamp}.${img.mimeType.includes('png') ? 'png' : 'jpg'}`);
		writeFileSync(p, Buffer.from(img.base64, 'base64'));
		say(relative(process.cwd(), p));
	});
	if (!images.length) say(json ? JSON.stringify(json).slice(0, 500) : 'No image came back.');
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
	if (cssTexts.length) o.css = cssSummary(cssTexts.join('\n'));
	writeFileSync(join(outDir, `${base}.raw.html`), html);
	writeFileSync(join(outDir, `${base}.html`), cleanHtml(html));
	writeFileSync(join(outDir, `${base}.outline.json`), JSON.stringify(o, null, '\t'));
	const text = outlineText(o);
	writeFileSync(join(outDir, `${base}.outline.txt`), text);
	say(text);
	say(`Saved to ${relative(process.cwd(), outDir)}/: ${base}.html (cleaned), ${base}.raw.html, ${base}.outline.json${cssTexts.length ? `, ${cssTexts.length} stylesheet${cssTexts.length === 1 ? '' : 's'}` : ''}`);
}

async function publish(ctx) {
	if (!flags.yes) fail('Publishing makes the live site a copy of the preview site. Look at it first (`tidysites shot /`), then run `tidysites publish --yes`.');
	const { json, text } = await tool(ctx.cfg, 'publish_website', { site_id: ctx.cfg.site });
	say(json ? JSON.stringify(json, null, 2) : text);
}

function help() {
	say(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(2, 20).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
	say(`\nFiles:\n  <collection>/<slug>.json      { "id", "slug", "status", "updated_at", "data": {...} }; a new entry is a new file with "data"\n  <collection>/<slug>.css       data.custom_css as a file (rows: data.css); rows/<slug>.html is data.html\n  ${META}/                   config, key, the last pull, the content model, screenshots\n\nImages: an image field or a Columns image slot takes { "$media": { "url": "https://...", "alt": "..." } }; the push fetches it into the library.\nReferences: a record names another by its id, or "$ref:<slug-or-id>" for one in the same push.`);
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
		case 'gallery':
			return shot(config(), '/_tidy/gallery', { view: 'desktop', name: 'gallery' });
		case 'pages':
			return pages(config());
		case 'page':
			return page(config());
		case 'schema':
			return schema(config());
		case 'fetch':
			return fetchCmd(config(false));
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
