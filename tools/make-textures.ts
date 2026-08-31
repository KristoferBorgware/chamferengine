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
import { BIOME_PRESETS, BLOCK_COLORS, BlockType } from "chamfer/generation";
import { RECIPES, bandOf, srgb, writePng } from "./blockTiles.mjs";

/**
 * An image the generator can draw, and how a block wears it.
 *
 * Every picture carries its own colours and is read exactly as it is.
 */
interface Image {
	readonly name: string;
	readonly recipe: keyof typeof RECIPES;
	/** Drawn as the band that drapes over a side, and clear below it. */
	readonly band?: boolean;
	/** The colour it is drawn in. A picture carries its own; nothing is shared. */
	readonly color: readonly [number, number, number];
}

const NEUTRAL: readonly [number, number, number] = [0.5, 0.5, 0.5];

/**
 * The six kinds of ground, and whether anything grows on one.
 *
 * A vegetated ground drapes a band over the side of its block and shows dirt
 * below it; a mineral one is the same material all the way down, so a sand
 * cliff is sand rather than sand over soil.
 */
const FAMILIES = {
	turf: { grows: true },
	moss: { grows: true },
	scrub: { grows: true },
	dune: { grows: false },
	scree: { grows: false },
	frost: { grows: false },
} as const;

type Family = keyof typeof FAMILIES;

/** Linear light back to the sRGB hex the registry and the diagrams use. */
function hexOf(color: readonly [number, number, number]): string {
	return color
		.map((v) =>
			Math.round(255 * Math.max(0, Math.min(1, v)) ** (1 / 2.2))
				.toString(16)
				.padStart(2, "0"),
		)
		.join("");
}

/** Hue in degrees, saturation and lightness, from an sRGB hex. */
function hsl(hex: string): [number, number, number] {
	const n = parseInt(hex, 16);
	const r = ((n >> 16) & 255) / 255;
	const g = ((n >> 8) & 255) / 255;
	const b = (n & 255) / 255;
	const hi = Math.max(r, g, b);
	const lo = Math.min(r, g, b);
	const l = (hi + lo) / 2;
	const d = hi - lo;
	if (d < 1e-6) return [0, 0, l];
	const sat = d / (1 - Math.abs(2 * l - 1));
	let h =
		hi === r
			? ((g - b) / d) % 6
			: hi === g
				? (b - r) / d + 2
				: (r - g) / d + 4;
	return [((h * 60) % 360 + 360) % 360, sat, l];
}

/**
 * Which kind of ground a biome stands on, read off the colour it was given.
 *
 * **Not off its temperature and humidity.** Those say what grows, not what
 * the ground is made of: a beach is sand because it is a beach, and its
 * climate is a warm wet one it shares with a rainforest. The colour is
 * already somebody's statement of what the place looks like -- a grey is
 * rock, a pale blue is ice, a saturated yellow is sand -- so it is the one
 * field that answers the question being asked.
 *
 * A default rather than a decision. `blocks.json` is hand-editable, and one
 * line there moves a biome to another family or gives it a picture of its own.
 */
function familyOf(hex: string): Family {
	const [h, s, l] = hsl(hex);
	if (s < 0.1) return l > 0.72 ? "frost" : "scree";
	if (h >= 180) return l > 0.72 ? "frost" : "moss";
	// Orange and red are clay, whatever else they are.
	if (h < 30) return "scree";
	if (h < 65) return l > 0.66 || s > 0.6 ? "dune" : "scrub";
	return l < 0.42 ? "moss" : s < 0.26 ? "scrub" : "turf";
}

/** The family each biome's ground is DRAWN LIKE, by block number. */
const GROUND_FAMILY = new Map<number, Family>(
	Object.values(BIOME_PRESETS)
		.flat()
		.map((biome) => [biome.block, familyOf(biome.hex)]),
);

/** The block a name refers to. */
const blockOf = (name: string): number =>
	(BlockType as Record<string, number>)[name]!;

/** Its registry colour, or stone's where the registry has none. */
const colorOf = (name: string): readonly [number, number, number] =>
	BLOCK_COLORS[blockOf(name)] ?? BLOCK_COLORS[BlockType.STONE]!;

/** A block type's own picture, named the way the block is. */
const fileOf = (name: string): string => name.toLowerCase();

/**
 * Every picture the generator can draw.
 *
 * **One a block type, not one a family.** A tundra and a steppe are different
 * places and get different pictures; the family only decides which recipe
 * seeds one, so a beach starts out sandy and a badlands starts out as broken
 * rock. Nothing is shared -- a file carries its own
 * colours, so what an editor shows is what the world draws.
 */
const IMAGES: readonly Image[] = [
	// The plain materials, and the rock a biome cuts into.
	...(
		[
			["stone", "stone"],
			["bedrock", "bedrock"],
			["dirt", "dirt"],
			["sand", "sand"],
			["snow", "snow"],
			["sandstone", "sandstone"],
			["terracotta", "terracotta"],
			["water", "water"],
		] as const
	).map(
		([name, recipe]): Image => ({
			name,
			recipe,
			color: colorOf(name.toUpperCase()),
		}),
	),
	// One a ground, plus the band it drapes over a side where it grows.
	...Object.keys(BlockType)
		.filter((n) => n === "GRASS" || n.endsWith("_GROUND"))
		.flatMap((n): Image[] => {
			const family = GROUND_FAMILY.get(blockOf(n)) ?? "turf";
			const base: Image = {
				name: fileOf(n),
				recipe: family,
				color: colorOf(n),
			};
			if (!FAMILIES[family].grows) return [base];
			return [
				base,
				{ ...base, name: `${fileOf(n)}_overlay`, band: true },
			];
		}),
	// One a species, for the wood and for the leaf.
	...Object.keys(BlockType)
		.filter((n) => n.endsWith("_WOOD") || n.endsWith("_LEAF"))
		.map(
			(n): Image => ({
				name: fileOf(n),
				recipe: n.endsWith("_WOOD") ? "wood" : "leaf",
				color: colorOf(n),
			}),
		),
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
	/** Drawn over the side, where a block's side is two materials. */
	readonly overlay?: string;
}

const one = (name: string): Slots => ({ top: name, side: name, bottom: name });

/** Which images each block type wears, before anybody edits the manifest. */
function slotsFor(name: string): Slots {
	if (name.endsWith("_WOOD") || name.endsWith("_LEAF"))
		return one(fileOf(name));
	if (name === "GRASS" || name.endsWith("_GROUND")) {
		const family = GROUND_FAMILY.get(blockOf(name)) ?? "turf";
		// A ground that grows something shows dirt down its side under a band
		// of itself; one that does not is the same material all the way.
		if (!FAMILIES[family].grows) return one(fileOf(name));
		return {
			top: fileOf(name),
			side: "dirt",
			bottom: "dirt",
			overlay: `${fileOf(name)}_overlay`,
		};
	}
	const known = new Set([
		"STONE",
		"DIRT",
		"SAND",
		"SNOW",
		"WATER",
		"BEDROCK",
		"SANDSTONE",
		"TERRACOTTA",
	]);
	return one(known.has(name) ? fileOf(name) : "stone");
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

if (args.includes("--list")) {
	for (const image of IMAGES)
		console.log(image.name);
	process.exit(0);
}
if (!Number.isInteger(Math.log2(size)) || size < 8 || size > 128)
	throw new Error(`--size must be a power of two from 8 to 128, not ${size}`);

// ---- writing ---------------------------------------------------------------
mkdirSync(out, { recursive: true });

/** One image as RGBA bytes at `n` texels a side. */
function draw(image: Image, n: number): Buffer {
	const seed = [...image.name].reduce(
		(h, c) => (h * 31 + c.charCodeAt(0)) | 0,
		7,
	);
	const rgba = Buffer.alloc(n * n * 4);
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			let shade: number;
			let alpha: number;
			const color = image.color;
			if (image.band) {
				[shade, alpha] = bandOf(
					RECIPES[image.recipe],
					x,
					y,
					n,
					seed,
				);
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

// **One picture a name, and a variation is a block type of its own.** A second
// picture for one block was drawable here and wearable nowhere: a block names
// exactly one picture a face, so an extra file spent a layer and changed no
// pixel. Layers are the scarce thing, so that is a cost with no benefit.
const wrote: string[] = [];
const kept: string[] = [];
for (const image of IMAGES) {
	const path = join(out, `${image.name}.png`);
	if (existsSync(path) && !force) {
		kept.push(image.name);
		continue;
	}
	writePng(path, size, size, draw(image, size));
	wrote.push(image.name);
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
// **Only what something reads.** A variant count, a tint list and a tint scale
// were written here and read by no part of the bake or the runtime, which made
// the file describe mechanisms the engine does not have.
const manifest = {
	size,
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
		`${size}x${size}, ` +
		`${(bytes / 1024).toFixed(1)} KB on disk`,
);
if (wrote.length > 0) console.log(`  written: ${wrote.join(", ")}`);
if (kept.length > 0) console.log(`  kept:    ${kept.join(", ")}`);
console.log(`  blocks.json ${manifestSays}, ${Object.keys(slots).length} block types`);
if (kept.length > 0 && !force)
	console.log("  --force takes back a file somebody edited");
