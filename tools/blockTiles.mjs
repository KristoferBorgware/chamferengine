// The noise a block tile is drawn from, and how to write one out.
//
// Shared by `make-textures.ts`, which writes the initial set of files, and by
// `trial-tiles.mjs`, which draws them on the grid they will be seen on.
// Written once because the two would agree until either was retuned.
//
// **The recipes seed a file; they do not own it.** What ships is whatever is
// on disk under `assets/blocks/`, hand-painted or not, and the generator
// refuses to overwrite a file that is already there.

import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

/** A wrapping uint32 hash over two coordinates, the same shape the world uses. */
export function hash2(x, y, seed) {
	let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0;
	h = (h ^ (seed | 0)) >>> 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
	return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/** Per texel, which is the finest thing a tile can say. */
export const grain = (x, y, seed) => hash2(x, y, seed);

/**
 * Value noise with NO interpolation: `period` blocks of one value each.
 *
 * This is what separates a stylized tile from static. Smooth noise quantized
 * gives a cloud with hard edges; blocky noise quantized gives CLUMPS -- runs
 * of two and three texels holding one shade, which is what a hand-drawn 16x16
 * stone is. The lattice wraps, so the tile does.
 */
export function blocky(x, y, period, size, seed) {
	const s = period / size;
	const m = (v) => ((v % period) + period) % period;
	return hash2(m(Math.floor(x * s)), m(Math.floor(y * s)), seed);
}

/** Octaves of blocky noise, coarse first, divided by the summed amplitude. */
export function clumps(x, y, size, seed, periods, gain = 0.55) {
	let sum = 0;
	let amp = 0;
	let a = 1;
	for (const p of periods) {
		sum += a * blocky(x, y, p, size, seed + p * 977);
		amp += a;
		a *= gain;
	}
	return sum / amp;
}

/**
 * The octave periods for a tile `n` texels a side.
 *
 * Coarsest is a QUARTER of the tile, never a half: at a half the tile splits
 * visibly into four quadrants and the split is the same in every tile, so it
 * reads as a grid laid over the world. Finest is one texel. Written against
 * the tile size rather than fixed, so 32 holds the same features as 16 with a
 * finer grain on top instead of the same picture drawn bigger.
 */
export function octaves(n) {
	const out = [];
	for (let p = 4; p <= n; p *= 2) out.push(p);
	return out;
}

/** Quantize to `levels` steps, which is the whole of the stylization. */
export const step = (v, levels) =>
	Math.min(levels - 1, Math.max(0, Math.floor(v * levels))) / (levels - 1);

// ---- the recipes ----------------------------------------------------------
//
// Every one returns a SHADE around 1 and an alpha, never a colour: the colour
// is the block's own from the registry, so a tile's mean is the number the map
// is drawn in and a picture of the map still names the block the world builds
// there. It is also what lets forty-four biome grounds share one image.
export const RECIPES = {
	stone: (x, y, n, s) => [0.8 + step(clumps(x, y, n, s, octaves(n)), 4) * 0.42, 1],
	bedrock: (x, y, n, s) => [
		0.62 + step(clumps(x, y, n, s + 101, octaves(n)), 4) * 0.44,
		1,
	],
	dirt: (x, y, n, s) => [
		0.74 + step(clumps(x, y, n, s + 3, octaves(n), 0.62), 4) * 0.56,
		1,
	],
	sand: (x, y, n, s) => [
		0.88 + step(clumps(x, y, n, s + 7, octaves(n), 0.5), 4) * 0.26,
		1,
	],
	snow: (x, y, n, s) => {
		const v = step(clumps(x, y, n, s + 9, octaves(n), 0.5), 3);
		return [0.88 + v * 0.16 + (grain(x, y, s + 61) > 0.94 ? 0.06 : 0), 1];
	},

	// ---- the six kinds of ground a biome stands on -------------------------
	//
	// A biome differs from its neighbour in colour, which the registry already
	// holds, and in what the ground is MADE of, which it does not. These are
	// that second thing: six patterns, each tinted by whichever biome wears
	// it, so forty-four grounds are six pictures and not forty-four.

	/** Ordinary grass: fine clumps, nothing bare showing through. */
	turf: (x, y, n, s) => [
		0.76 + step(clumps(x, y, n, s + 5, octaves(n), 0.6), 4) * 0.5,
		1,
	],

	/** Wet and dense -- darker, tighter, with a few bright growths in it. */
	moss: (x, y, n, s) => {
		const v = step(clumps(x, y, n, s + 23, octaves(n), 0.7), 4);
		return [0.66 + v * 0.5 + (grain(x, y, s + 71) > 0.93 ? 0.14 : 0), 1];
	},

	/**
	 * Dry ground with the earth showing through it.
	 *
	 * Two fields rather than one: the cover says where anything grows and the
	 * clumps say what it looks like where it does. A single field quantized
	 * harder gives a darker grass, not a patchy one.
	 */
	scrub: (x, y, n, s) => {
		const cover = blocky(x, y, Math.max(4, n / 4), n, s + 37);
		const v = step(clumps(x, y, n, s + 13, octaves(n), 0.6), 4);
		return [(cover < 0.42 ? 0.66 : 0.84) + v * 0.4, 1];
	},

	/** Sand: almost no contrast, and a ripple across it rather than clumps. */
	dune: (x, y, n, s) => {
		const ripple = clumps(0, y, n, s + 47, [4, 8], 0.5);
		const v = step(clumps(x, y, n, s + 19, octaves(n), 0.45) * 0.7 + ripple * 0.3, 4);
		return [0.9 + v * 0.18, 1];
	},

	/**
	 * Broken rock: coarse and hard-edged.
	 *
	 * The finest octave is left out, so the shades sit in chunks of two and
	 * three texels rather than grain -- which is what reads as fragments of
	 * stone instead of as sand.
	 */
	scree: (x, y, n, s) => [
		0.7 + step(clumps(x, y, n, s + 29, octaves(n).slice(0, -1), 0.75), 4) * 0.58,
		1,
	],

	/** Snow and ice: flat, three shades, and the odd catch of light. */
	frost: (x, y, n, s) => {
		const v = step(clumps(x, y, n, s + 41, octaves(n), 0.5), 3);
		return [0.9 + v * 0.14 + (grain(x, y, s + 83) > 0.95 ? 0.08 : 0), 1];
	},

	// ---- the rock a biome cuts into ----------------------------------------
	//
	// Bands along one axis rather than clumps, because what makes sandstone
	// and terracotta read is that they were laid down in layers.

	sandstone: (x, y, n, s) => {
		const band = clumps(0, y, n, s + 53, [4, 8, n], 0.6);
		const g = grain(x, y, s + 59) * 0.22;
		return [0.9 + step(band * 0.8 + g, 4) * 0.2, 1];
	},

	terracotta: (x, y, n, s) => {
		const band = clumps(0, y, n, s + 67, [4, 8, n], 0.68);
		const g = grain(x, y, s + 73) * 0.18;
		return [0.78 + step(band * 0.82 + g, 5) * 0.44, 1];
	},

	water: (x, y, n, s) => [
		0.94 + step(clumps(x, y, n, s + 89, octaves(n), 0.5), 3) * 0.12,
		1,
	],

	wood: (x, y, n, s) => {
		// Grain runs along the trunk, so the field is one-dimensional across
		// it: every row holds the same stripes, jittered a texel at a time.
		const stripe = clumps(x, 0, n, s + 13, [3, 6, n], 0.55);
		const knot = clumps(x, y, n, s + 31, [4, 8], 0.5);
		return [0.74 + step(stripe * 0.78 + knot * 0.22, 4) * 0.52, 1];
	},

	leaf: (x, y, n, s) => {
		const f = clumps(x, y, n, s + 17, octaves(n), 0.62);
		// The darkest level is a HOLE rather than a shade, which is what makes
		// a canopy read as leaves rather than as a green cube.
		return [0.74 + step(f, 4) * 0.54, f < 0.3 ? 0 : 1];
	},
};

/**
 * The band of ground that drapes over the side of a block, and nothing below
 * it.
 *
 * Takes the recipe of whichever ground is on top, so a scrub band is patchy
 * where a turf band is not. Transparent under its own ragged join, because
 * what shows there is the dirt the side is already drawn in -- one file
 * tinted whole would paint a desert's dirt green.
 */
export function bandOf(recipe, x, y, n, s) {
	const scale = n / 16;
	const cut = Math.round((2.5 + blocky(x, 0, 8, n, s + 41) * 3) * scale);
	if (y >= cut) return [0, 0];
	const [shade] = recipe(x, y, n, s);
	return [shade, 1];
}

// ---- writing a PNG, with no dependency -------------------------------------
const CRC = (() => {
	const t = new Int32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c;
	}
	return t;
})();

function crc32(buf) {
	let c = -1;
	for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
	return (c ^ -1) >>> 0;
}

function chunk(type, data) {
	const out = Buffer.alloc(12 + data.length);
	out.writeUInt32BE(data.length, 0);
	out.write(type, 4, "ascii");
	data.copy(out, 8);
	out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
	return out;
}

/** Write RGBA bytes as a PNG. */
export function writePng(path, width, height, rgba) {
	const raw = Buffer.alloc(height * (1 + width * 4));
	for (let y = 0; y < height; y++) {
		raw[y * (1 + width * 4)] = 0;
		rgba.copy(
			raw,
			y * (1 + width * 4) + 1,
			y * width * 4,
			(y + 1) * width * 4,
		);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	writeFileSync(
		path,
		Buffer.concat([
			Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
			chunk("IHDR", ihdr),
			chunk("IDAT", deflateSync(raw, { level: 9 })),
			chunk("IEND", Buffer.alloc(0)),
		]),
	);
}

/** A byte back to linear light: the exact inverse of {@link srgb}. */
export function linearOf(byte) {
	const c = byte / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear light to a byte, which is the space a PNG is read back in. */
export function srgb(v) {
	const c = Math.max(0, Math.min(1, v));
	return Math.round(
		255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055),
	);
}

// ---- reading one back ------------------------------------------------------
/**
 * A PNG as width, height and RGBA bytes.
 *
 * The alpha is kept, which `frame-diff.mjs` does not need and a block tile
 * does: a leaf's darkest level is a hole rather than a shade.
 */
export function readPng(path) {
	const file = readFileSync(path);
	let at = 8;
	let width = 0;
	let height = 0;
	let depth = 0;
	let kind = 0;
	const parts = [];
	while (at < file.length) {
		const length = file.readUInt32BE(at);
		const tag = file.toString("ascii", at + 4, at + 8);
		const body = file.subarray(at + 8, at + 8 + length);
		if (tag === "IHDR") {
			width = body.readUInt32BE(0);
			height = body.readUInt32BE(4);
			depth = body[8];
			kind = body[9];
		} else if (tag === "IDAT") parts.push(body);
		else if (tag === "IEND") break;
		at += 12 + length;
	}
	if (depth !== 8) throw new Error(`${path}: ${depth} bits a channel`);
	const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[kind];
	if (!channels) throw new Error(`${path}: color type ${kind}`);
	const raw = inflateSync(Buffer.concat(parts));
	const stride = width * channels;
	const out = Buffer.alloc(width * height * 4);
	const line = new Uint8Array(stride);
	const previous = new Uint8Array(stride);
	let read = 0;
	for (let row = 0; row < height; row++) {
		const filter = raw[read++];
		for (let i = 0; i < stride; i++) {
			const x = raw[read + i];
			const a = i >= channels ? line[i - channels] : 0;
			const b = previous[i];
			const c = i >= channels ? previous[i - channels] : 0;
			let value = x;
			if (filter === 1) value = x + a;
			else if (filter === 2) value = x + b;
			else if (filter === 3) value = x + ((a + b) >> 1);
			else if (filter === 4) {
				const p = a + b - c;
				const pa = Math.abs(p - a);
				const pb = Math.abs(p - b);
				const pc = Math.abs(p - c);
				value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
			}
			line[i] = value & 0xff;
		}
		read += stride;
		for (let x = 0; x < width; x++) {
			const from = x * channels;
			const to = (row * width + x) * 4;
			out[to] = line[from];
			out[to + 1] = channels >= 3 ? line[from + 1] : line[from];
			out[to + 2] = channels >= 3 ? line[from + 2] : line[from];
			out[to + 3] = channels === 4 ? line[from + 3] : channels === 2 ? line[from + 1] : 255;
		}
		previous.set(line);
	}
	return { width, height, rgba: out };
}

// ---- a label, because a sheet of a hundred pictures needs one --------------

/**
 * A three by five pixel face, one glyph a number: bit `y * 3 + x` is lit.
 *
 * Lowercase, digits and the three marks a file name uses. Small enough to
 * write out and large enough to read at one pixel a texel, which is what a
 * label under a tile has room for.
 */
const GLYPHS = {
	" ": 0,
	"-": 448,
	".": 8192,
	"0": 11114,
	"1": 29850,
	"2": 29347,
	"3": 14499,
	"4": 18925,
	"5": 14543,
	"6": 10958,
	"7": 4775,
	"8": 10922,
	"9": 14762,
	"_": 28672,
	"a": 24400,
	"b": 14168,
	"c": 25200,
	"d": 27504,
	"e": 25552,
	"f": 9684,
	"g": 15728,
	"h": 23241,
	"i": 29890,
	"j": 11012,
	"k": 23273,
	"l": 29843,
	"m": 24552,
	"n": 23384,
	"o": 11088,
	"p": 5976,
	"q": 19824,
	"r": 4840,
	"s": 14576,
	"t": 17594,
	"u": 27496,
	"v": 11112,
	"w": 24552,
	"x": 21672,
	"y": 15720,
	"z": 30008,
};

/** Draw `text` into RGBA `buf`, top-left at `ox, oy`. Returns its width. */
export function label(buf, stride, ox, oy, text, rgb = [150, 154, 162]) {
	let at = ox;
	for (const ch of text.toLowerCase()) {
		const bits = GLYPHS[ch] ?? GLYPHS["-"];
		for (let y = 0; y < 5; y++)
			for (let x = 0; x < 3; x++) {
				if (!(bits & (1 << (y * 3 + x)))) continue;
				const d = ((oy + y) * stride + at + x) * 4;
				buf[d] = rgb[0];
				buf[d + 1] = rgb[1];
				buf[d + 2] = rgb[2];
				buf[d + 3] = 255;
			}
		at += 4;
	}
	return at - ox;
}

/** How wide `text` will be, in pixels. */
export const labelWidth = (text) => text.length * 4;
