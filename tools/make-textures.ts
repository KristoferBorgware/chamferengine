/**
 * Write the initial block textures, one PNG a slot, and the manifest binding
 * blocks to them.
 *
 *   npx vite-node tools/make-textures.ts [--size 16|32] [--out dir] [--force]
 *   npx vite-node tools/make-textures.ts --list
 *
 * **The noise seeds a file; it does not own one.** A texture that is already
 * on disk is left exactly as it is, so the loop is: generate once, paint over
 * whichever ones matter, generate again for anything new. `--force` is the
 * only thing that overwrites, and it says which files it took back.
 *
 * That is the whole difference between this and `tools/make-figures.js`, which
 * regenerates every diagram from the constructions the docs describe and
 * refuses to be hand-edited.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BLOCK_COLORS, BlockType } from "chamfer/generation";
import { RECIPES, grassSide, srgb, writePng } from "./blockTiles.mjs";

/**
 * An image the generator can draw, and how a block wears it.
 *
 * `tint` marks an image drawn in grey, to be multiplied by the block's own
 * registry colour when it is read. That is what lets the forty-four biome
 * grounds and the thirteen species share one picture apiece: they differ in
 * colour and not in pattern, and a colour is already written down once in the
 * registry. An untinted image carries its own colours and is read as it is.
 */
interface Image {
	readonly name: string;
	readonly recipe: keyof typeof RECIPES | "groundOverlay";
	readonly tint: boolean;
	/** The colour it is drawn in. Grey for a tinted one, so grey x colour is colour. */
	readonly color: readonly [number, number, number];
}

/**
 * The grey a tinted image is drawn in, and what a reader multiplies back.
 *
 * **Half, not white.** A recipe returns a shade around 1 and reaches 1.28 at
 * its brightest, so an image drawn at white clips every bright texel to white
 * and the top of the range is gone from the file. Drawn at half, the whole
 * range fits and the reader takes `2 * texel * the block's colour`.
 */
const NEUTRAL: readonly [number, number, number] = [0.5, 0.5, 0.5];
const TINT_SCALE = 2;

const IMAGES: readonly Image[] = [
	{ name: "stone", recipe: "stone", tint: false, color: BLOCK_COLORS[BlockType.STONE]! },
	{ name: "bedrock", recipe: "bedrock", tint: false, color: BLOCK_COLORS[BlockType.BEDROCK]! },
	{ name: "dirt", recipe: "dirt", tint: false, color: BLOCK_COLORS[BlockType.DIRT]! },
	{ name: "sand", recipe: "sand", tint: false, color: BLOCK_COLORS[BlockType.SAND]! },
	{ name: "snow", recipe: "snow", tint: false, color: BLOCK_COLORS[BlockType.SNOW]! },
	// Water's own surface is a shader-drawn shell; this is what a lake and
	// a bucket are made of, so it is nearly flat rather than grained.
	{ name: "water", recipe: "sand", tint: false, color: BLOCK_COLORS[BlockType.WATER]! },
	// The ground's own three, drawn in grey. Every biome ground and plain
	// grass wear these and differ only by the colour the registry gives them.
	{ name: "ground_top", recipe: "grass", tint: true, color: NEUTRAL },
	// **The side is two files, because one cannot be half tinted.** The body
	// is dirt in dirt's own colour, the same under every biome; the overlay is
	// the grass band alone, grey and transparent below its own ragged join, so
	// the biome's colour reaches the band and leaves the dirt as dirt. One
	// file tinted whole would paint a desert's dirt green.
	{ name: "ground_side", recipe: "dirt", tint: false, color: BLOCK_COLORS[BlockType.DIRT]! },
	{ name: "ground_overlay", recipe: "groundOverlay", tint: true, color: NEUTRAL },
	{ name: "wood", recipe: "wood", tint: true, color: NEUTRAL },
	{ name: "leaf", recipe: "leaf", tint: true, color: NEUTRAL },
];

/**
 * The three slots a block wears: the cap it is walked on, the side, and the
 * face seen from below.
 *
 * **Three, not two.** A cave ceiling and the underside of an overhang are
 * ordinary sights here, and a grass block seen from below is dirt. Most blocks
 * name one image for all three.
 */
interface Slots {
	readonly top: string;
	readonly side: string;
	readonly bottom: string;
	/** Drawn over the side and tinted, where a block's side is two materials. */
	readonly overlay?: string;
}

const one = (name: string): Slots => ({ top: name, side: name, bottom: name });

/** Which images each block type wears, before anybody edits the manifest. */
function slotsFor(name: string): Slots {
	if (name === "GRASS" || name.endsWith("_GROUND"))
		return {
			top: "ground_top",
			side: "ground_side",
			bottom: "dirt",
			overlay: "ground_overlay",
		};
	if (name.endsWith("_WOOD")) return one("wood");
	if (name.endsWith("_LEAF")) return one("leaf");
	const known: Record<string, string> = {
		STONE: "stone",
		DIRT: "dirt",
		SAND: "sand",
		SNOW: "snow",
		WATER: "water",
		BEDROCK: "bedrock",
	};
	return one(known[name] ?? "stone");
}

// ---- the arguments ---------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
	const at = args.indexOf(name);
	return at < 0 ? fallback : (args[at + 1] ?? fallback);
};
const size = Number(flag("--size", "32"));
const out = flag("--out", "assets/blocks");
const force = args.includes("--force");
/**
 * How many pictures of each material to seed.
 *
 * **A hexagon shows a whole tile, so one picture a material reads as a grid.**
 * Measured over a field of grass, the ground correlates with itself shifted
 * one cell at `0.63` with one picture; the cell's own six-fold turn takes that
 * to `0.27` and a second and third picture take it to near nothing
 * (`tools/trial-tiles.mjs`). Variants past the first are written as
 * `stone.2.png` and are ordinary files: paint them, or delete the ones that
 * are not worth having and the reader falls back to what is left.
 */
const variants = Math.max(1, Number(flag("--variants", "1")));

if (args.includes("--list")) {
	for (const image of IMAGES)
		console.log(`${image.name.padEnd(14)} ${image.tint ? "tinted" : "own colour"}`);
	process.exit(0);
}
if (!Number.isInteger(Math.log2(size)) || size < 8 || size > 128)
	throw new Error(`--size must be a power of two from 8 to 128, not ${size}`);

// ---- writing ---------------------------------------------------------------
mkdirSync(out, { recursive: true });

/** One image as RGBA bytes at `n` texels a side. */
function draw(image: Image, n: number, variant: number): Buffer {
	const seed =
		[...image.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) +
		variant * 7919;
	const rgba = Buffer.alloc(n * n * 4);
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			let shade: number;
			let alpha: number;
			let color = image.color;
			if (image.recipe === "groundOverlay") {
				// The grass band alone: opaque down to its own ragged join and
				// nothing below it, so what shows under is the dirt the side
				// is already drawn in.
				const [which, pair] = grassSide(x, y, n, seed);
				[shade] = pair as [number, number];
				alpha = which === "grass" ? 1 : 0;
			} else {
				[shade, alpha] = RECIPES[image.recipe](x, y, n, seed);
			}
			const at = (y * n + x) * 4;
			rgba[at] = srgb(color[0] * shade);
			rgba[at + 1] = srgb(color[1] * shade);
			rgba[at + 2] = srgb(color[2] * shade);
			rgba[at + 3] = Math.round(alpha * 255);
		}
	return rgba;
}

const wrote: string[] = [];
const kept: string[] = [];
for (const image of IMAGES)
	for (let variant = 1; variant <= variants; variant++) {
		const name =
			variant === 1 ? image.name : `${image.name}.${variant}`;
		const path = join(out, `${name}.png`);
		if (existsSync(path) && !force) {
			kept.push(name);
			continue;
		}
		writePng(path, size, size, draw(image, size, variant));
		wrote.push(name);
	}

// ---- the manifest ----------------------------------------------------------
//
// Hand-editable like the images: pointing a block at a file of its own is a
// line here and nothing else. What the generator will not do is rewrite a
// manifest that is already there, for the same reason it will not rewrite a
// texture.
const manifestPath = join(out, "blocks.json");
const slots: Record<string, Slots> = {};
for (const name of Object.keys(BlockType)) {
	if (name === "AIR") continue;
	slots[name] = slotsFor(name);
}
const manifest = {
	size,
	variants,
	// A tinted image is grey and is read as `tintScale * texel * the block's
	// own registry colour`; an untinted one carries its colours already.
	tintScale: TINT_SCALE,
	tinted: IMAGES.filter((i) => i.tint).map((i) => i.name),
	blocks: slots,
};
let manifestSays = "wrote";
if (existsSync(manifestPath) && !force) {
	const held = JSON.parse(readFileSync(manifestPath, "utf8")) as {
		size?: number;
	};
	manifestSays = held.size === size ? "kept" : `kept, and it says size ${held.size}`;
} else {
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
}

const bytes = readdirSync(out)
	.filter((f) => f.endsWith(".png"))
	.reduce((sum, f) => sum + statSync(join(out, f)).size, 0);
console.log(
	`${out}: ${wrote.length} written, ${kept.length} kept, ` +
		`${size}x${size}, ${variants} of each, ` +
		`${(bytes / 1024).toFixed(1)} KB on disk`,
);
if (wrote.length > 0) console.log(`  written: ${wrote.join(", ")}`);
if (kept.length > 0) console.log(`  kept:    ${kept.join(", ")}`);
console.log(`  blocks.json ${manifestSays}, ${Object.keys(slots).length} block types`);
if (kept.length > 0 && !force)
	console.log("  --force takes back a file somebody edited");
