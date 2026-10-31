import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAll, validateMenuNames } from '../lib/validate.mjs';

const schema = {
	collections: {
		items: [
			{
				slug: 'pages',
				fields: [
					{ slug: 'title', type: 'string', required: true },
					{ slug: 'hero_image', type: 'image' },
					{ slug: 'noindex', type: 'boolean' },
					{ slug: 'sections', type: 'blocks', validation: { allowedTypes: ['hero', 'columns'] } },
					{ slug: 'custom_css', type: 'text' }
				]
			},
			{ slug: 'services', fields: [{ slug: 'title', type: 'string', required: true }, { slug: 'category', type: 'reference' }, { slug: 'page', type: 'select', validation: { options: ['on', 'off'] } }] }
		]
	},
	section_types: {
		items: [
			{ slug: 'hero', fields: [{ slug: 'variant', type: 'select', validation: { options: ['headline and photo', 'headline and form'] } }, { slug: 'headline', type: 'string' }, { slug: 'image', type: 'image' }] },
			{
				slug: 'columns',
				fields: [
					{ slug: 'across', type: 'integer' },
					{ slug: 'slots', type: 'repeater', validation: { subFields: [{ slug: 'kind', type: 'select', options: ['text', 'image'] }, { slug: 'text', type: 'text' }, { slug: 'image', type: 'image' }] } }
				]
			},
			{ slug: 'team', fields: [] }
		]
	}
};

const entry = (collection, slug, data) => ({ [`${collection}/${slug}`]: { id: slug, slug, status: 'published', updated_at: null, data } });

test('a good page passes', () => {
	const local = entry('pages', 'home', {
		title: 'Home',
		hero_image: { $media: { url: 'https://x.test/a.jpg', alt: 'A' } },
		sections: [
			{ _type: 'hero', _key: 'h', variant: 'headline and photo', headline: 'Hi', image: { provider: 'local', id: '01X' } },
			{ _type: 'columns', across: 3, slots: [{ kind: 'text', text: '**bold**' }, { kind: 'image', image: { $media: { url: 'https://x.test/b.jpg', alt: '' } } }] }
		]
	});
	assert.deepEqual(validateAll(local, schema), []);
});

test('a picture from the folder passes on an image field; a video does not', () => {
	assert.deepEqual(validateAll(entry('pages', 'home', { title: 'Home', hero_image: { $media: { file: 'assets/hero.svg', alt: 'A' } } }), schema), []);
	const bad = validateAll(entry('pages', 'home', { title: 'Home', hero_image: { $media: { file: 'assets/hero.mp4', alt: '' } } }), schema);
	assert.equal(bad.length, 1);
	assert.match(bad[0], /a picture: png, jpg/);
});

test('unknown fields, types, options and shapes are named with the file', () => {
	const local = entry('pages', 'about', {
		title: 'About',
		subtitle: 'nope',
		noindex: 'yes',
		hero_image: 'https://x.test/a.jpg',
		sections: [
			{ _type: 'team', headline: 'x' },
			{ _type: 'banner' },
			{ _type: 'hero', variant: 'giant', photo: {} },
			{ _type: 'columns', slots: [{ kind: 'video', caption: 'c' }] }
		]
	});
	const errors = validateAll(local, schema);
	const has = (re) => assert.ok(errors.some((e) => re.test(e)), `missing ${re}\n${errors.join('\n')}`);
	has(/pages\/about\.json: data\.subtitle is not a field of pages/);
	has(/data\.noindex: expected true or false/);
	has(/data\.hero_image: an image is the stored value/);
	has(/sections\[0\]: "team" is not a section type this field takes/);
	has(/sections\[1\]: "banner" is not a section type/);
	has(/sections\[2\] \(hero\)\.variant: "giant" is not one of/);
	has(/sections\[2\] \(hero\)\.photo: not a field of hero/);
	has(/slots\[0\]\.kind: "video" is not one of/);
	has(/slots\[0\]\.caption: not a field of this row/);
});

test('required fields and unknown collections', () => {
	const local = { ...entry('services', 'x', { page: 'maybe' }), ...entry('things', 'y', { title: 'T' }) };
	const errors = validateAll(local, schema);
	assert.ok(errors.some((e) => /services\/x\.json: data\.title is required/.test(e)));
	assert.ok(errors.some((e) => /data\.page: "maybe" is not one of "on", "off"/.test(e)));
	assert.ok(errors.some((e) => /no collection named "things"/.test(e)));
});

test('a new menu needs a name the website accepts; a menu the website has keeps its name', () => {
	assert.deepEqual(validateMenuNames(['footer_links', 'footer-policies', 'primary'], ['primary']).length, 1);
	assert.match(validateMenuNames(['footer-policies'], [])[0], /lowercase letters, digits and underscores/);
	assert.deepEqual(validateMenuNames(['Weird-Name'], ['Weird-Name']), []);
});
