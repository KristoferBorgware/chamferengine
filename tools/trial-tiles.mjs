// What the block textures on disk look like, and on the grid they are drawn on.
//
//   npx vite-node tools/make-textures.ts -- --size 16 --out /tmp/b16
//   node tools/trial-tiles.mjs <out-dir> /tmp/b16 [/tmp/b32 ...]
//
// Reads whatever PNGs are in each directory rather than generating any, so a
// texture somebody has painted over is what gets drawn. Two pictures:
//
//   `tiles.png`  every image, two by two, so the wrap is visible.
//   `ground.png` a patch of the real hexagonal grid at the pixels-per-metre a
//                1080p screen gives at 5, 12 and 30 m, so a tile size can be
//                judged at the size it will actually be seen.
//
// It also prints how much the ground repeats at one cell, which is the thing
// a hexagonal grid makes worse than a square one and the cell's own six-fold
// turn makes better.
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { hash2, readPng, writePng } from "./blockTiles.mjs";

const args = process.argv.slice(2);
const OUT = args[0] ?? ".";
const DIRS = args.slice(1);
if (DIRS.length === 0) {
	console.error("usage: node tools/trial-tiles.mjs <out-dir> <blocks-dir>...");
	process.exit(1);
}
mkdirSync(OUT, { recursive: true });

/** Everything one directory holds, by name, plus what the manifest says. */
function load(dir) {
	const manifest = JSON.parse(readFileSync(join(dir, "blocks.json"), "utf8"));
	// `stone.png`, `stone.2.png`, `stone.3.png` are one material with three
	// pictures of it, which is what stops a hexagonal field reading as a grid.
	const images = new Map();
	for (const file of readdirSync(dir).filter((f) => f.endsWith(".png"))) {
		const [name] = basename(file, ".png").split(".");
		const held = images.get(name) ?? [];
		held.push(readPng(join(dir, file)));
		images.set(name, held);
	}
	return { dir, manifest, images };
}
const SETS = DIRS.map(load);

/** The registry colour a tinted image is read through, as bytes. */
const TINTS = {
	ground_top: [66, 112, 48],
	ground_overlay: [66, 112, 48],
	wood: [115, 79, 48],
	leaf: [51, 97, 41],
};

/**
 * One texel of an image, tinted if the manifest says the image is grey.
 *
 * `tintScale * texel * colour`, which is what a shader would do: a tinted file
 * is drawn at half so its bright end is not clipped away, and the scale takes
 * it back.
 */
function texel(set, name, x, y, tint, variant = 0) {
	const all = set.images.get(name);
	const img = all[variant % all.length];
	const n = img.width;
	const at = ((((y % n) + n) % n) * n + (((x % n) + n) % n)) * 4;
	const grey = set.manifest.tinted.includes(name);
	const scale = grey ? (set.manifest.tintScale ?? 2) : 1;
	const c = grey ? (tint ?? TINTS[name] ?? [255, 255, 255]) : [255, 255, 255];
	return [
		Math.min(255, (img.rgba[at] * scale * c[0]) / 255),
		Math.min(255, (img.rgba[at + 1] * scale * c[1]) / 255),
		Math.min(255, (img.rgba[at + 2] * scale * c[2]) / 255),
		img.rgba[at + 3],
	];
}

/** One texel exactly as the file holds it, with no tint and no scale. */
function rawTexel(img, x, y) {
	const n = img.width;
	const at = ((((y % n) + n) % n) * n + (((x % n) + n) % n)) * 4;
	return [img.rgba[at], img.rgba[at + 1], img.rgba[at + 2], img.rgba[at + 3]];
}

const PAD = 8;
const BACK = [24, 26, 30];
function sheetOf(width, height) {
	const buf = Buffer.alloc(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		buf[i * 4] = BACK[0];
		buf[i * 4 + 1] = BACK[1];
		buf[i * 4 + 2] = BACK[2];
		buf[i * 4 + 3] = 255;
	}
	return buf;
}

// ---- every image, magnified ------------------------------------------------
//
// Two rows a directory: the file as it sits on disk, and the same file as the
// world reads it. They differ for the four grey ones, which is the thing that
// catches somebody painting: `ground_top.png` is grey and comes out green,
// and painting it green would come out green twice over. The disk row sits on
// a checkerboard so a hole reads as a hole rather than as a colour.
{
	const NAMES = [...SETS[0].images.keys()].sort();
	const CELL = 112;
	const CHECK = [
		[46, 48, 54],
		[62, 64, 72],
	];
	const W = NAMES.length * (CELL + PAD) + PAD;
	const H = SETS.length * 2 * (CELL + PAD) + PAD;
	const sheet = sheetOf(W, H);
	SETS.forEach((set, which) => {
		for (const asWorld of [false, true]) {
			const row = which * 2 + (asWorld ? 1 : 0);
			NAMES.forEach((name, col) => {
				if (!set.images.has(name)) return;
				const img = set.images.get(name)[0];
				const n = img.width;
				const ox = PAD + col * (CELL + PAD);
				const oy = PAD + row * (CELL + PAD);
				const scale = CELL / (n * 2);
				for (let y = 0; y < CELL; y++)
					for (let x = 0; x < CELL; x++) {
						const tx = Math.floor(x / scale);
						const ty = Math.floor(y / scale);
						const under = asWorld
							? BACK
							: CHECK[
									((x >> 3) + (y >> 3)) % 2
								];
						const p = asWorld
							? texel(set, name, tx, ty)
							: rawTexel(img, tx, ty);
						const d = ((oy + y) * W + ox + x) * 4;
						const a = p[3] / 255;
						for (let c = 0; c < 3; c++)
							sheet[d + c] = Math.round(
								p[c] * a + under[c] * (1 - a),
							);
						// A ground side is the dirt with the grass band over
						// it, which is what two files buy: the band takes the
						// biome's colour and the dirt stays dirt.
						if (
							asWorld &&
							name === "ground_side" &&
							set.images.has("ground_overlay")
						) {
							const o = texel(set, "ground_overlay", tx, ty);
							const oa = o[3] / 255;
							for (let c = 0; c < 3; c++)
								sheet[d + c] = Math.round(
									o[c] * oa + sheet[d + c] * (1 - oa),
								);
						}
						sheet[d + 3] = 255;
					}
			});
		}
	});
	writePng(join(OUT, "tiles.png"), W, H, sheet);
	console.log(`tiles.png   ${NAMES.join(", ")}`);
	SETS.forEach((set, which) => {
		console.log(
			`  rows ${which * 2 + 1}-${which * 2 + 2}: ` +
				`${set.manifest.size}x${set.manifest.size}  ${set.dir}` +
				"\n    on disk, over a checkerboard, then as the world reads it",
		);
	});
}

// ---- the same images on the grid, at the size they will be seen -------------
//
// A 65 degree vertical field over 1080 rows puts 848 / d pixels on a metre at
// d metres, and a cell is a block wide. So the picture below is 1:1 with a
// screen: what is drawn is what a player standing that far off would see.
const PIXELS_PER_METRE = (d) => 848 / d;
// Near enough that a texel is many pixels, and far enough that it is under
// one. Closer than this the panel is inside a single cell and says nothing
// about a grid; further and both tile sizes are the same blur.
const AWAY = [5, 12, 30];
const PANEL = 300;

/**
 * How many samples a pixel takes across, which stands in for a mip chain.
 *
 * A tile read nearest at thirty metres puts three texels inside a pixel and
 * draws the interference between them rather than the material. Averaging a
 * few samples is not what a GPU does -- it reads a mip -- but it is the same
 * answer, and without it the far panel compares two kinds of noise.
 */
const SAMPLES = 3;

/** Which cell a point in the plane belongs to, by the engine's own rounding. */
function cellOf(px, py, size) {
	const bx = [size, 0];
	const by = [size * 0.5, (size * Math.sqrt(3)) / 2];
	const det = bx[0] * by[1] - bx[1] * by[0];
	const q = (px * by[1] - py * by[0]) / det;
	const r = (py * bx[0] - px * bx[1]) / det;
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
	// The centre of the cell that was ROUNDED TO, not the point that was
	// asked about: what a tile is laid out from is where its own cell stands.
	return [rq, rr, rq * bx[0] + rr * by[0], rq * bx[1] + rr * by[1]];
}

/** A patch of stone in the grass, so a boundary shows as well as a field. */
const isStone = (q, r) =>
	Math.abs(q - 2) + Math.abs(r + 3) + Math.abs(q + r - -1) <= 4;

const W = AWAY.length * (PANEL + PAD) + PAD;
const H = SETS.length * (PANEL + PAD) + PAD;
const ground = sheetOf(W, H);

/**
 * The ground drawn into a buffer at a given cell spacing.
 *
 * One routine for the panels and for the measurement, so what is counted is
 * what is drawn.
 */
function drawGround(set, spacing, buf, stride, ox, oy, width, height, turn6 = true, pick = true) {
	const n = set.images.get("ground_top")[0].width;
	const at = (px, py) => {
		const [q, r, cx, cy] = cellOf(px, py, spacing);
		// **A hexagon has six rotations that map it onto itself**, so one
		// image can be laid six ways and the cell's own hash picks which. A
		// square face has four.
		const turn = turn6 ? (Math.floor(hash2(q, r, 7) * 6) * Math.PI) / 3 : 0;
		const c = Math.cos(turn);
		const s = Math.sin(turn);
		let dx = (px - cx) / (spacing * 0.62);
		let dy = (py - cy) / (spacing * 0.62);
		[dx, dy] = [dx * c - dy * s, dx * s + dy * c];
		const p = texel(
			set,
			isStone(q, r) ? "stone" : "ground_top",
			Math.floor((dx * 0.5 + 0.5) * n),
			Math.floor((dy * 0.5 + 0.5) * n),
			undefined,
			// Which picture of the material this cell wears, by its own hash.
			pick ? Math.floor(hash2(q, r, 91) * 8) : 0,
		);
		// The engine's own per-cell speckle, still doing its job.
		const shade = 1 + (hash2(q, r, 31) - 0.5) * 2 * 0.06;
		return [p[0] * shade, p[1] * shade, p[2] * shade];
	};
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const sum = [0, 0, 0];
			for (let sy = 0; sy < SAMPLES; sy++)
				for (let sx = 0; sx < SAMPLES; sx++) {
					const p = at(
						x - width / 2 + (sx + 0.5) / SAMPLES - 0.5,
						y - height / 2 + (sy + 0.5) / SAMPLES - 0.5,
					);
					for (let k = 0; k < 3; k++) sum[k] += p[k];
				}
			const d = ((oy + y) * stride + ox + x) * 4;
			for (let k = 0; k < 3; k++)
				buf[d + k] = Math.min(
					255,
					Math.round(sum[k] / (SAMPLES * SAMPLES)),
				);
			buf[d + 3] = 255;
		}
}

SETS.forEach((set, row) => {
	AWAY.forEach((away, col) => {
		drawGround(
			set,
			PIXELS_PER_METRE(away),
			ground,
			W,
			PAD + col * (PANEL + PAD),
			PAD + row * (PANEL + PAD),
			PANEL,
			PANEL,
		);
	});
});

// **How much a field repeats at the cell lattice**, on a field of its own
// rather than on a panel: a shift of one cell at two metres is most of a
// panel wide, and what fell outside it had no variance to correlate.
const FIELD = 420;
const SPACING = 24;
function repeatOf(set, turn6, pick) {
	const field = sheetOf(FIELD, FIELD);
	drawGround(set, SPACING, field, FIELD, 0, 0, FIELD, FIELD, turn6, pick);
	const bx = [SPACING, 0];
	const by = [SPACING * 0.5, (SPACING * Math.sqrt(3)) / 2];
	let total = 0;
	for (const [sx, sy] of [bx, by, [by[0] - bx[0], by[1] - bx[1]]]) {
		const dx = Math.round(sx);
		const dy = Math.round(sy);
		const a = [];
		const b = [];
		for (let y = 60; y < FIELD - 60; y++)
			for (let x = 60; x < FIELD - 60; x++) {
				const [q, r] = cellOf(x - FIELD / 2, y - FIELD / 2, SPACING);
				// Grass only: two samples both landing in the stone patch
				// would read as a match between materials, not within one.
				if (isStone(q, r)) continue;
				a.push(field[(y * FIELD + x) * 4 + 1]);
				b.push(field[((y + dy) * FIELD + x + dx) * 4 + 1]);
			}
		const mean = (v) => v.reduce((t, k) => t + k, 0) / v.length;
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
	return total / 3;
}
const repeats = SETS.map((set) => [
	set,
	repeatOf(set, false, false),
	repeatOf(set, true, false),
	repeatOf(set, true, true),
]);
writePng(join(OUT, "ground.png"), W, H, ground);
console.log(`\nground.png  1:1 with a 1080p screen at ${AWAY.join(", ")} m`);
SETS.forEach((set, row) =>
	console.log(
		`  row ${row + 1}: ${set.manifest.size}x${set.manifest.size}  ` +
			`${(848 / set.manifest.size).toFixed(0)} m before a texel is a pixel`,
	),
);
console.log(
	`\n  how much the ground repeats at one cell, at ${SPACING} px a cell` +
		"\n         one tile a cell   turned six ways   and every variant",
);
for (const [set, flat, turned, picked] of repeats)
	console.log(
		`    ${String(set.manifest.size).padStart(3)}px` +
			`${flat.toFixed(3).padStart(16)}${turned.toFixed(3).padStart(18)}` +
			`${picked.toFixed(3).padStart(19)}`,
	);
