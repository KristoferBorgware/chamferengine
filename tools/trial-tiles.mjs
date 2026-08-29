// Block tiles out of wrapped, quantized value noise, and what they look like
// on the grid they would be drawn on.
//
//   node tools/trial-tiles.mjs [out-dir]
//
// Writes two pictures. `tiles.png` is a contact sheet of every recipe at 16
// and at 32 texels, each drawn two by two so the wrap is visible. `tiled.png`
// is a patch of the real hexagonal grid seen from above, three ways: one tile
// a cell, the cell's own hash turning it one of six ways, and that plus four
// tiles of the same material -- with how much each repeats at one cell
// printed beside it.
//
// **A prototype, not engine code.** Nothing here is imported by the client; it
// exists so a texturing scheme can be looked at before anything is built
// against it. Zero dependencies, like every other script in here.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? ".";
mkdirSync(OUT, { recursive: true });

// ---- the noise ------------------------------------------------------------

/** A wrapping uint32 hash over two coordinates, the same shape the world uses. */
function hash2(x, y, seed) {
	let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0;
	h = (h ^ (seed | 0)) >>> 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
	return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/** Per texel, which is the finest thing a tile can say. */
const grain = (x, y, seed) => hash2(x, y, seed);

/**
 * Value noise with NO interpolation: `period` blocks of one value each.
 *
 * This is what separates a stylized tile from static. Smooth noise quantized
 * gives a cloud with hard edges; blocky noise quantized gives CLUMPS -- runs
 * of two and three texels holding one shade, which is what a hand-drawn 16x16
 * stone is. The lattice wraps, so the tile does.
 */
function blocky(x, y, period, size, seed) {
	const s = period / size;
	const m = (v) => ((v % period) + period) % period;
	return hash2(m(Math.floor(x * s)), m(Math.floor(y * s)), seed);
}

/** Octaves of blocky noise, coarse first, divided by the summed amplitude. */
function clumps(x, y, size, seed, periods, gain = 0.55) {
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
function octaves(n) {
	const out = [];
	for (let p = 4; p <= n; p *= 2) out.push(p);
	return out;
}

/** Quantize to `levels` steps, which is the whole of the stylization. */
const step = (v, levels) =>
	Math.min(levels - 1, Math.max(0, Math.floor(v * levels))) / (levels - 1);

// ---- the recipes ----------------------------------------------------------
//
// Every one returns a SHADE around 1 and an alpha, never a colour: the colour
// is the block's own from the registry, so a tile's mean is the number the map
// is drawn in and a picture of the map still names the block the world builds
// there. It is also what lets forty-four biome grounds share one image.
const RECIPES = {
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
	grass: (x, y, n, s) => [
		0.76 + step(clumps(x, y, n, s + 5, octaves(n), 0.6), 4) * 0.5,
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

/** Grass over dirt, with the join cut by the same wrapping noise. */
function grassSide(x, y, n, s) {
	const scale = n / 16;
	const cut = Math.round((2.5 + blocky(x, 0, 8, n, s + 41) * 3) * scale);
	if (y < cut) return ["grass", RECIPES.grass(x, y, n, s)];
	// A darker line right under the grass, which is what reads as an edge
	// rather than as two materials meeting.
	const [shade, alpha] = RECIPES.dirt(x, y - cut, n, s);
	return ["dirt", [y < cut + scale ? shade * 0.82 : shade, alpha]];
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

function writePng(path, width, height, rgba) {
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

// ---- the contact sheet -----------------------------------------------------

/** The engine's own registry colours, which is where a tile's colour comes from. */
const COLORS = {
	stone: [0.42, 0.42, 0.45],
	dirt: [0.36, 0.26, 0.17],
	grass: [0.26, 0.44, 0.19],
	sand: [0.76, 0.7, 0.5],
	snow: [0.92, 0.94, 0.97],
	bedrock: [0.17, 0.16, 0.19],
	wood: [0.45, 0.31, 0.19],
	leaf: [0.2, 0.38, 0.16],
};

const srgb = (v) => {
	const c = Math.max(0, Math.min(1, v));
	return Math.round(
		255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055),
	);
};

/** One tile as RGBA, `n` texels a side. */
function tile(name, n, seed) {
	const out = Buffer.alloc(n * n * 4);
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			let key = name;
			let shade;
			let alpha;
			if (name === "grassSide") {
				const [which, pair] = grassSide(x, y, n, seed);
				key = which;
				[shade, alpha] = pair;
			} else {
				[shade, alpha] = RECIPES[name](x, y, n, seed);
			}
			const c = COLORS[key];
			const at = (y * n + x) * 4;
			out[at] = srgb(c[0] * shade);
			out[at + 1] = srgb(c[1] * shade);
			out[at + 2] = srgb(c[2] * shade);
			out[at + 3] = Math.round(alpha * 255);
		}
	return out;
}

const NAMES = [
	"stone",
	"bedrock",
	"dirt",
	"grass",
	"grassSide",
	"sand",
	"snow",
	"wood",
	"leaf",
];
const SIZES = [16, 32];
const CELL = 128;
const PAD = 8;
{
	const W = NAMES.length * (CELL + PAD) + PAD;
	const H = SIZES.length * (CELL + PAD) + PAD;
	const sheet = Buffer.alloc(W * H * 4);
	for (let i = 0; i < W * H; i++) {
		sheet[i * 4] = 24;
		sheet[i * 4 + 1] = 26;
		sheet[i * 4 + 2] = 30;
		sheet[i * 4 + 3] = 255;
	}
	SIZES.forEach((n, row) => {
		NAMES.forEach((name, col) => {
			const px = tile(name, n, 1337);
			const ox = PAD + col * (CELL + PAD);
			const oy = PAD + row * (CELL + PAD);
			const scale = CELL / (n * 2);
			for (let y = 0; y < CELL; y++)
				for (let x = 0; x < CELL; x++) {
					const s =
						((Math.floor(y / scale) % n) * n +
							(Math.floor(x / scale) % n)) *
						4;
					const d = ((oy + y) * W + ox + x) * 4;
					const a = px[s + 3] / 255;
					for (let c = 0; c < 3; c++)
						sheet[d + c] = Math.round(
							px[s + c] * a + sheet[d + c] * (1 - a),
						);
					sheet[d + 3] = 255;
				}
		});
	});
	writePng(join(OUT, "tiles.png"), W, H, sheet);
	console.log(`tiles.png  ${NAMES.join(", ")}`);
	console.log("           top row 16, bottom row 32, each drawn 2x2");
}

// ---- the same tiles on the grid they are drawn on --------------------------

const N = 16;
const SEEDS = [1337, 8821, 4409, 2203];
const GREENS = SEEDS.map((s) => tile("grass", N, s));
const GREYS = SEEDS.map((s) => tile("stone", N, s));

/** Centre-to-centre spacing of a cell, in pixels of the picture. */
const SIZE = 26;
const BX = [SIZE, 0];
const BY = [SIZE * 0.5, (SIZE * Math.sqrt(3)) / 2];

/** Which cell a point in the plane belongs to, by the engine's own rounding. */
function cellOf(px, py) {
	const det = BX[0] * BY[1] - BX[1] * BY[0];
	const q = (px * BY[1] - py * BY[0]) / det;
	const r = (py * BX[0] - px * BX[1]) / det;
	const a = -q - r;
	let ra = Math.round(a);
	let rq = Math.round(q);
	let rr = Math.round(r);
	const da = Math.abs(ra - a);
	const dq = Math.abs(rq - q);
	const dr = Math.abs(rr - r);
	if (da > dq && da > dr) ra = -rq - rr;
	else if (dq > dr) rq = -ra - rr;
	else rr = -ra - rq;
	return [rq, rr];
}

const centreOf = (q, r) => [
	q * BX[0] + r * BY[0],
	q * BX[1] + r * BY[1],
];
const cellHash = (a, b, s) => hash2(a, b, s);

const MODES = ["one tile a cell", "turned, 6 ways", "turned, and 4 tiles"];
const PANEL = 300;
const W = MODES.length * (PANEL + PAD) + PAD;
const H = PANEL + PAD * 2;
const out = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
	out[i * 4] = 24;
	out[i * 4 + 1] = 26;
	out[i * 4 + 2] = 30;
	out[i * 4 + 3] = 255;
}

/** A patch of stone in the grass, so a boundary is visible as well as a field. */
const isStone = (q, r) => Math.abs(q + 1) + Math.abs(r - 1) + Math.abs(q + r) <= 4;

MODES.forEach((mode, panel) => {
	const ox = PAD + panel * (PANEL + PAD);
	for (let y = 0; y < PANEL; y++)
		for (let x = 0; x < PANEL; x++) {
			const px = x - PANEL / 2;
			const py = y - PANEL / 2;
			const [q, r] = cellOf(px, py);
			const [cx, cy] = centreOf(q, r);
			// The cell's own square, sized so the hexagon fills it.
			let dx = (px - cx) / (SIZE * 0.62);
			let dy = (py - cy) / (SIZE * 0.62);
			if (panel > 0) {
				// **A hexagon has six rotations that map it onto itself**, so
				// one tile can be laid six ways and the cell's own hash picks
				// which. A square face has four.
				const turn = (Math.floor(cellHash(q, r, 7) * 6) * Math.PI) / 3;
				const c = Math.cos(turn);
				const s = Math.sin(turn);
				[dx, dy] = [dx * c - dy * s, dx * s + dy * c];
			}
			const variant = panel === 2 ? Math.floor(cellHash(q, r, 91) * 4) : 0;
			const src = isStone(q, r) ? GREYS[variant] : GREENS[variant];
			const u = ((Math.floor((dx * 0.5 + 0.5) * N) % N) + N) % N;
			const v = ((Math.floor((dy * 0.5 + 0.5) * N) % N) + N) % N;
			const s = (v * N + u) * 4;
			// The engine's own per-cell speckle, still doing its job on top.
			const shade = 1 + (cellHash(q, r, 31) - 0.5) * 2 * 0.06;
			const d = ((y + PAD) * W + ox + x) * 4;
			for (let c = 0; c < 3; c++)
				out[d + c] = Math.min(255, Math.round(src[s + c] * shade));
			out[d + 3] = 255;
		}
});
writePng(join(OUT, "tiled.png"), W, H, out);

// **How much a field repeats at the cell lattice**: correlate a panel with
// itself shifted by one cell along each of the three lattice axes, over the
// grass only. 1 is a perfect repeat -- every cell showing the same picture --
// and 0 is a field with no cell grid left in it.
const SHIFTS = [BX, BY, [BY[0] - BX[0], BY[1] - BX[1]]];
console.log("\ntiled.png  how much the ground repeats at one cell");
MODES.forEach((mode, panel) => {
	const ox = PAD + panel * (PANEL + PAD);
	const at = (x, y) => out[((y + PAD) * W + ox + x) * 4 + 1];
	let total = 0;
	for (const [sx, sy] of SHIFTS) {
		const dx = Math.round(sx);
		const dy = Math.round(sy);
		const a = [];
		const b = [];
		for (let y = 40; y < PANEL - 40; y++)
			for (let x = 40; x < PANEL - 40; x++) {
				const [q, r] = cellOf(x - PANEL / 2, y - PANEL / 2);
				// Grass only: two samples both landing in the stone patch
				// would read as a match between materials, not within one.
				if (Math.abs(q + 1) + Math.abs(r - 1) + Math.abs(q + r) <= 6)
					continue;
				a.push(at(x, y));
				b.push(at(x + dx, y + dy));
			}
		const mean = (v) => v.reduce((s, n) => s + n, 0) / v.length;
		const ma = mean(a);
		const mb = mean(b);
		let num = 0;
		let va = 0;
		let vb = 0;
		for (let i = 0; i < a.length; i++) {
			num += (a[i] - ma) * (b[i] - mb);
			va += (a[i] - ma) ** 2;
			vb += (b[i] - mb) ** 2;
		}
		total += num / Math.sqrt(va * vb);
	}
	console.log(`             ${mode.padEnd(22)} ${(total / SHIFTS.length).toFixed(3)}`);
});
