import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandPlan, imageSize } from '../lib/bands.mjs';

test('reads the size of a JPEG and a PNG from the header', () => {
	// A minimal JPEG: SOI, APP0 (16 bytes), SOF0 with height 5976 and width 1280.
	const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x17, 0x58, 0x05, 0x00, 0x03]);
	assert.deepEqual(imageSize(jpeg), { width: 1280, height: 5976 });
	const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]), Buffer.from([0, 0, 0x03, 0x34, 0, 0, 0x10, 0x00]), Buffer.alloc(8)]);
	assert.deepEqual(imageSize(png), { width: 820, height: 4096 });
	assert.equal(imageSize(Buffer.from('hello')), null);
});

test('plans bands only for a tall picture, the last one shorter', () => {
	assert.deepEqual(bandPlan(2400), []);
	assert.deepEqual(bandPlan(5976), [{ y: 0, height: 1600 }, { y: 1600, height: 1600 }, { y: 3200, height: 1600 }, { y: 4800, height: 1176 }]);
});
