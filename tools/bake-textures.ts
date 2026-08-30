/**
 * Bake the block pictures into what the GPU reads: one strip a mip level, and
 * a table saying which layer each block wears on each of its faces.
 *
 *   npx vite-node tools/bake-textures.ts [--in dir] [--out dir]
 *
 * **A texture array, not an atlas.** Every layer mips down to one texel on its
 * own with nothing to bleed into, and `repeat` on a wall that merges several
 * layers is the sampler's own job rather than arithmetic in the shader. 256
 * layers are guaranteed everywhere and the set is well under that.
 *
 * A level is written as one PNG holding every layer stacked, which is exactly
 * the byte order `writeTexture` wants for an array: layer 0's rows, then layer
 * 1's. So the client decodes one image a level and uploads it in one call.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { BlockType } from "chamfer/generation";
import { ALPHA_CUT } from "chamfer/render";
import { readPng, writePng } from "./blockTiles.mjs";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
	const at = args.indexOf(name);
	return at < 0 ? fallback : (args[at + 1] ?? fallback);
};
const from = flag("--in", "assets/blocks");
const out = flag("--out", "packages/client/public/blocks");

const manifest = JSON.parse(
	readFileSync(join(from, "blocks.json"), "utf8"),
) as {
	size: number;
	blocks: Record<
		string,
		{ top: string; side: string; bottom: string; overlay?: string }
	>;
};

/**
 * Every picture, by name, in the order the layers are numbered.
 *
 * Sorted, so a layer index is the same on every machine and a baked sheet can
 * be compared against another. A variant -- `stone.2.png` -- is a layer of its
 * own; which one a cell wears is the shader's business, not the bake's.
 */
const files = readdirSync(from)
	.filter((f) => f.endsWith(".png"))
	.sort();
const names = files.map((f) => basename(f, ".png"));
const layerOf = new Map(names.map((name, at) => [name, at]));

/** The eight texels around one, for {@link bleed}. */
const NEAR: readonly [number, number][] = [
	[-1, -1],
	[0, -1],
	[1, -1],
	[-1, 0],
	[1, 0],
	[-1, 1],
	[0, 1],
	[1, 1],
];

/**
 * Spread the colour of what is drawn into the texels that are not.
 *
 * **A filter mixes colours it is told to ignore.** The alpha says a texel is
 * not there and the red, green and blue under it are still read: two texels
 * averaged at a mip level, or two blended along an edge, take half of a colour
 * nobody chose. Where that colour is black -- which is what a picture drawn on
 * a transparent ground has -- a grass band's own edge darkens toward it, and
 * every level down darkens further.
 *
 * So before anything is halved, each transparent texel takes the average of
 * whichever neighbours have colour, over and over until the picture is full.
 * **The alpha is untouched**: nothing is drawn that was not, and the shape the
 * shader tests against is exactly the one on disk. It wraps at the edges,
 * because these tiles tile.
 */
function bleed(src: Buffer, wide: number): Buffer {
	const out = Buffer.from(src);
	const filled = new Uint8Array(wide * wide);
	for (let at = 0; at < wide * wide; at++) filled[at] = out[at * 4 + 3]! > 0 ? 1 : 0;
	for (let pass = 0; pass < wide; pass++) {
		const was = Uint8Array.from(filled);
		let moved = 0;
		for (let y = 0; y < wide; y++)
			for (let x = 0; x < wide; x++) {
				const at = y * wide + x;
				if (was[at]) continue;
				let r = 0;
				let g = 0;
				let b = 0;
				let n = 0;
				for (const [dx, dy] of NEAR) {
					const nx = (x + dx + wide) % wide;
					const ny = (y + dy + wide) % wide;
					const from = ny * wide + nx;
					if (!was[from]) continue;
					r += out[from * 4]!;
					g += out[from * 4 + 1]!;
					b += out[from * 4 + 2]!;
					n++;
				}
				if (n === 0) continue;
				out[at * 4] = Math.round(r / n);
				out[at * 4 + 1] = Math.round(g / n);
				out[at * 4 + 2] = Math.round(b / n);
				filled[at] = 1;
				moved++;
			}
		if (moved === 0) break;
	}
	return out;
}

const size = manifest.size;
const images = files.map((f) => {
	const png = readPng(join(from, f));
	if (png.width !== size || png.height !== size)
		throw new Error(
			`${f} is ${png.width}x${png.height}, and the manifest says ${size}`,
		);
	// The colour under what is not drawn, so no filter anywhere downstream
	// mixes in a colour nobody chose.
	return bleed(png.rgba, size);
});

/** One level down: a box filter over two by two, alpha included. */
function halve(src: Buffer, wide: number): Buffer {
	const half = wide >> 1;
	const dst = Buffer.alloc(half * half * 4);
	for (let y = 0; y < half; y++)
		for (let x = 0; x < half; x++) {
			for (let c = 0; c < 4; c++) {
				const a = src[((y * 2) * wide + x * 2) * 4 + c]!;
				const b = src[((y * 2) * wide + x * 2 + 1) * 4 + c]!;
				const d = src[((y * 2 + 1) * wide + x * 2) * 4 + c]!;
				const e = src[((y * 2 + 1) * wide + x * 2 + 1) * 4 + c]!;
				dst[(y * half + x) * 4 + c] = Math.round((a + b + d + e) / 4);
			}
		}
	return dst;
}

/**
 * How much of a level is drawn, at the threshold the shader tests against.
 *
 * Coverage, not mean alpha: the shader keeps a pixel whole or drops it whole,
 * so what matters is how many texels clear the bar rather than how much alpha
 * there is in total.
 */
function coverage(src: Buffer, scale = 1): number {
	let on = 0;
	for (let at = 3; at < src.length; at += 4)
		if ((src[at]! / 255) * scale >= ALPHA_CUT) on++;
	return on / (src.length / 4);
}

/**
 * Raise a level's alpha until it draws as much as the finest one did.
 *
 * **A box filter dissolves a canopy, and it does it silently.** Averaging four
 * texels of which one is a leaf gives a quarter alpha, which fails the test --
 * so at every halving the thin parts of a picture fall below the threshold and
 * a tree seen from a distance loses its outer leaves, then its inner ones,
 * then all of them. The mean alpha is what the filter preserves and the
 * *coverage* is what the shader reads.
 *
 * So each level is scaled until it clears the bar over the same fraction of
 * itself the finest one did. Bisection rather than arithmetic, because
 * coverage against scale is a step function over the level's own histogram and
 * has no closed form; sixteen halvings settle it to a part in 65,000.
 *
 * **It only ever raises.** A filter that happens to widen a shape by a texel
 * is nothing anyone sees, and trimming it back means scaling a texel down to
 * sit exactly on the threshold -- where one rounding step drops it out
 * altogether, which is the very failure this is here to prevent. Measured: at
 * the last level a leaf tile is one texel, and the two-sided form put it at
 * 127 of the 128 the test wants and erased the whole picture.
 */
function holdCoverage(src: Buffer, want: number): Buffer {
	if (want <= 0 || coverage(src) >= want) return src;
	let low = 1;
	let high = 8;
	for (let step = 0; step < 16; step++) {
		const mid = (low + high) / 2;
		if (coverage(src, mid) < want) low = mid;
		else high = mid;
	}
	const out = Buffer.from(src);
	for (let at = 3; at < out.length; at += 4)
		out[at] = Math.min(255, Math.round(out[at]! * high));
	return out;
}

mkdirSync(out, { recursive: true });
const levels = Math.log2(size) + 1;
/** What each picture draws at the finest level, for every level to hold to. */
const wanted = images.map((one) => coverage(one));
let level: Buffer[] = images;
let wide = size;
let held = 0;
for (let n = 0; n < levels; n++) {
	// Every layer stacked into one strip, which is the byte order an array
	// texture is written in.
	const strip = Buffer.concat(level);
	writePng(join(out, `blocks-${n}.png`), wide, wide * names.length, strip);
	if (wide === 1) break;
	level = level.map((one, at) => {
		const smaller = halve(one, wide);
		const fixed = holdCoverage(smaller, wanted[at]!);
		if (fixed !== smaller) held++;
		return fixed;
	});
	wide >>= 1;
}

/**
 * Which layer each block wears, as four numbers a block: its cap, its side,
 * its underside, and the band drawn over the side or `-1` for none.
 *
 * By block NUMBER rather than by name, so the mesher indexes rather than looks
 * up. A block the manifest says nothing about takes stone's picture, which is
 * what an unnamed block has always drawn as.
 */
const SLOTS = 4;
const highest = Math.max(...Object.values(BlockType));
const table = new Int32Array((highest + 1) * SLOTS).fill(
	layerOf.get("stone") ?? 0,
);
for (const [name, slots] of Object.entries(manifest.blocks)) {
	const block = (BlockType as Record<string, number>)[name];
	if (block === undefined) continue;
	const pick = (which: string | undefined, fallback: number): number =>
		which === undefined ? fallback : (layerOf.get(which) ?? fallback);
	const top = pick(slots.top, 0);
	table[block * SLOTS] = top;
	table[block * SLOTS + 1] = pick(slots.side, top);
	table[block * SLOTS + 2] = pick(slots.bottom, top);
	table[block * SLOTS + 3] = slots.overlay ? pick(slots.overlay, -1) : -1;
}

writeFileSync(
	join(out, "blocks.json"),
	`${JSON.stringify(
		{
			size,
			levels: Math.min(levels, Math.log2(size) + 1),
			layers: names,
			slots: SLOTS,
			table: [...table],
		},
		null,
	)}\n`,
);

console.log(
	`${out}: ${names.length} layers at ${size}x${size}, ` +
		`${Math.log2(size) + 1} levels, ${(highest + 1) * SLOTS} table entries, ` +
		`${held} levels rescaled to hold their coverage`,
);
