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

const size = manifest.size;
const images = files.map((f) => {
	const png = readPng(join(from, f));
	if (png.width !== size || png.height !== size)
		throw new Error(
			`${f} is ${png.width}x${png.height}, and the manifest says ${size}`,
		);
	return png.rgba;
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

mkdirSync(out, { recursive: true });
const levels = Math.log2(size) + 1;
let level: Buffer[] = images;
let wide = size;
for (let n = 0; n < levels; n++) {
	// Every layer stacked into one strip, which is the byte order an array
	// texture is written in.
	const strip = Buffer.concat(level);
	writePng(join(out, `blocks-${n}.png`), wide, wide * names.length, strip);
	if (wide === 1) break;
	level = level.map((one) => halve(one, wide));
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
		`${Math.log2(size) + 1} levels, ${(highest + 1) * SLOTS} table entries`,
);
