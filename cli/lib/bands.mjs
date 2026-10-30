/**
 * A full-page screenshot of a long page is too tall for an assistant's image
 * reader to take in. Cut it into bands of a readable height, written beside
 * the original as <name>-band-01.jpg, -02, ... so a compare can go band by
 * band. The slicing uses a tool the machine already has (sips on macOS,
 * ImageMagick where installed); without one the original stands alone and
 * the caller is told.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export const BAND_HEIGHT = 1600;
/** A picture no taller than this is readable whole and is not cut. */
export const BAND_WHOLE = 2400;

/** Width and height of a JPEG or PNG from its header, or null when it is neither. */
export function imageSize(buf) {
	if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
		return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
	}
	if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
		let i = 2;
		while (i + 9 < buf.length) {
			if (buf[i] !== 0xff) { i++; continue; }
			const marker = buf[i + 1];
			if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
			const len = buf.readUInt16BE(i + 2);
			// SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC) carry the frame size.
			if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
				return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
			}
			i += 2 + len;
		}
	}
	return null;
}

/** The band files a picture of this height needs: [{ y, height }] from the top. */
export function bandPlan(height, band = BAND_HEIGHT, whole = BAND_WHOLE) {
	if (height <= whole) return [];
	const out = [];
	for (let y = 0; y < height; y += band) out.push({ y, height: Math.min(band, height - y) });
	return out;
}

function slicer() {
	if (process.platform === 'darwin' && existsSync('/usr/bin/sips')) return 'sips';
	for (const bin of ['magick', 'convert']) {
		const r = spawnSync(bin, ['-version'], { stdio: 'ignore' });
		if (r.status === 0) return bin;
	}
	return null;
}

/**
 * Write the bands of a saved picture beside it. Returns the band paths, or
 * an empty list with `reason` when the picture needs no cutting or the
 * machine has no tool to cut it with.
 */
export function writeBands(file, buf) {
	const size = imageSize(buf);
	if (!size) return { paths: [], reason: 'not a JPEG or PNG' };
	const plan = bandPlan(size.height);
	if (!plan.length) return { paths: [], reason: null };
	const tool = slicer();
	if (!tool) return { paths: [], reason: `the picture is ${size.height}px tall; no sips or ImageMagick here to cut it into bands` };
	const stem = file.replace(/\.(jpe?g|png)$/i, '');
	const ext = /\.png$/i.test(file) ? 'png' : 'jpg';
	const paths = [];
	plan.forEach((b, i) => {
		const out = `${stem}-band-${String(i + 1).padStart(2, '0')}.${ext}`;
		const r = tool === 'sips'
			? spawnSync('/usr/bin/sips', ['-c', String(b.height), String(size.width), '--cropOffset', String(b.y), '0', file, '--out', out], { stdio: 'ignore' })
			: spawnSync(tool, [file, '-crop', `${size.width}x${b.height}+0+${b.y}`, '+repage', out], { stdio: 'ignore' });
		if (r.status === 0 && existsSync(out)) paths.push(out);
	});
	return { paths, reason: null };
}
