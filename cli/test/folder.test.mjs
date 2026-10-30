import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffEntries, docToFiles, entryToFiles, filesToEntry, pushDocument, snapshotOf } from '../lib/folder.mjs';

const page = { id: '01A', slug: 'home', status: 'published', updated_at: '2026-10-30T10:00:00Z', data: { title: 'Home', sections: [{ _type: 'hero', _key: 'h', headline: 'Hi' }], custom_css: '.x{color:red}' } };
const row = { id: '01B', slug: 'footer', status: 'published', updated_at: '2026-10-30T10:00:00Z', data: { title: 'Footer', html: '<footer>f</footer>', css: '.ts-row{}' } };

test('an entry becomes its JSON plus sidecar files, and reads back the same', () => {
	const files = entryToFiles('pages', page);
	assert.deepEqual(Object.keys(files).sort(), ['pages/home.css', 'pages/home.json']);
	assert.equal(files['pages/home.css'], '.x{color:red}\n');
	const json = JSON.parse(files['pages/home.json']);
	assert.equal('custom_css' in json.data, false);
	const back = filesToEntry('pages', 'home', files['pages/home.json'], { css: files['pages/home.css'] });
	assert.deepEqual(back, page);
});

test('rows keep html and css as files', () => {
	const files = entryToFiles('rows', row);
	assert.deepEqual(Object.keys(files).sort(), ['rows/footer.css', 'rows/footer.html', 'rows/footer.json']);
	const back = filesToEntry('rows', 'footer', files['rows/footer.json'], { css: files['rows/footer.css'], html: files['rows/footer.html'] });
	assert.deepEqual(back, row);
});

test('a new file needs only data; the slug is the file name and the status defaults to published', () => {
	const e = filesToEntry('services', 'drain-cleaning', JSON.stringify({ data: { title: 'Drain cleaning' } }));
	assert.deepEqual(e, { id: 'drain-cleaning', slug: 'drain-cleaning', status: 'published', updated_at: null, data: { title: 'Drain cleaning' } });
});

test('a slug that disagrees with the file name, bad JSON, and a doubled sidecar field are refused by name', () => {
	assert.throws(() => filesToEntry('pages', 'home', JSON.stringify({ slug: 'about', data: {} })), /pages\/home\.json: slug "about"/);
	assert.throws(() => filesToEntry('pages', 'home', '{nope'), /not valid JSON/);
	assert.throws(() => filesToEntry('pages', 'home', JSON.stringify({ data: { custom_css: 'a{}' } }), { css: 'b{}' }), /set both/);
});

test('the diff names created, updated and removed entries against the snapshot', () => {
	const doc = { site: { exported_at: 'now' }, settings: { title: 'T' }, collections: [{ slug: 'pages', count: 2 }], content: { pages: [page, { ...page, id: '01C', slug: 'about', data: { title: 'About' } }] } };
	const snap = snapshotOf(doc);
	const local = {
		'pages/home': { ...page, data: { ...page.data, title: 'Home!' } },
		'pages/contact': { id: 'contact', slug: 'contact', status: 'published', updated_at: null, data: { title: 'Contact' } }
	};
	const d = diffEntries(local, snap);
	assert.deepEqual(d.created, ['pages/contact']);
	assert.deepEqual(d.updated, ['pages/home']);
	assert.deepEqual(d.removed, ['pages/about']);
	const push = pushDocument(local, snap, { keys: [...d.created, ...d.updated], removeKeys: d.removed, settings: { title: 'New' } });
	assert.deepEqual(push.expect, { 'pages/home': '2026-10-30T10:00:00Z', 'pages/about': '2026-10-30T10:00:00Z' });
	assert.deepEqual(push.remove, { pages: ['about'] });
	assert.equal(push.content.pages.length, 2);
	assert.equal(push.settings.title, 'New');
});

test('the same data in another key order is unchanged', () => {
	const snap = snapshotOf({ content: { pages: [page] } });
	const reordered = { ...page, data: { custom_css: page.data.custom_css, sections: page.data.sections, title: 'Home' } };
	assert.deepEqual(diffEntries({ 'pages/home': reordered }, snap).unchanged, ['pages/home']);
});

test('docToFiles writes settings and every entry', () => {
	const files = docToFiles({ settings: { title: 'T' }, content: { pages: [page], rows: [row] } });
	assert.deepEqual(Object.keys(files).sort(), ['pages/home.css', 'pages/home.json', 'rows/footer.css', 'rows/footer.html', 'rows/footer.json', 'settings.json']);
});
