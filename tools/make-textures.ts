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
 * `tint` marks an image drawn in grey, to be multiplied by the block's own
 * registry colour when it is read. That is what lets the forty-four biome
 * grounds and the thirteen species share one picture apiece: they differ in
 * colour and not in pattern, and a colour is already written down once in the
 * registry. An untinted image carries its own colours and is read as it is.
 */
interface Image {
	readonly name: string;
	readonly recipe: keyof typeof RECIPES;
	/** Drawn as the band that drapes over a side, and clear below it. */
	readonly band?: boolean;
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

const IMAGES: readonly Image[] = [
	{ name: "stone", recipe: "stone", tint: false, color: BLOCK_COLORS[BlockType.STONE]! },
	{ name: "bedrock", recipe: "bedrock", tint: false, color: BLOCK_COLORS[BlockType.BEDROCK]! },
	{ name: "dirt", recipe: "dirt", tint: false, color: BLOCK_COLORS[BlockType.DIRT]! },
	{ name: "sand", recipe: "sand", tint: false, color: BLOCK_COLORS[BlockType.SAND]! },
	{ name: "snow", recipe: "snow", tint: false, color: BLOCK_COLORS[BlockType.SNOW]! },
	// The rock a biome cuts into where it is not generic dirt, named by the
	// biome's own `underlay`. Both are laid down in bands rather than clumps.
	{ name: "sandstone", recipe: "sandstone", tint: false, color: BLOCK_COLORS[BlockType.SANDSTONE]! },
	{ name: "terracotta", recipe: "terracotta", tint: false, color: BLOCK_COLORS[BlockType.TERRACOTTA]! },
	// Lakes and buckets. The ocean is a shader-drawn shell with its own waves
	// and never reads this.
	{ name: "water", recipe: "water", tint: false, color: BLOCK_COLORS[BlockType.WATER]! },
	// One picture a family, drawn in grey and tinted by whichever biome wears
	// it, plus a band for the three that grow anything.
	...(Object.keys(FAMILIES) as Family[]).flatMap((family): Image[] => [
		{ name: `${family}_top`, recipe: family, tint: true, color: NEUTRAL },
		...(FAMILIES[family].grows
			? [
					{
						name: `${family}_overlay`,
						recipe: family,
						tint: true,
						color: NEUTRAL,
						band: true,
					} satisfies Image,
				]
			: []),
	]),
	{ name: "wood", recipe: "wood", tint: true, color: NEUTRAL },
	{ name: "leaf", recipe: "leaf", tint: true, color: NEUTRAL },
];

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

/** The family each biome's ground block wears, by block number. */
const GROUND_FAMILY = new Map<number, Family>(
	Object.values(BIOME_PRESETS)
		.flat()
		.map((biome) => [biome.block, familyOf(biome.hex)]),
);

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
	if (name.endsWith("_WOOD")) return one("wood");
	if (name.endsWith("_LEAF")) return one("leaf");
	const block = (BlockType as Record<string, number>)[name]!;
	const family = GROUND_FAMILY.get(block) ?? (name === "GRASS" ? "turf" : null);
	if (family) {
		// A ground that grows something shows dirt down its side under a band
		// of itself; one that does not is the same material all the way.
		if (!FAMILIES[family].grows) return one(`${family}_top`);
		return {
			top: `${family}_top`,
			side: "dirt",
			bottom: "dirt",
			overlay: `${family}_overlay`,
		};
	}
	const known: Record<string, string> = {
		STONE: "stone",
		DIRT: "dirt",
		SAND: "sand",
		SNOW: "snow",
		WATER: "water",
		BEDROCK: "bedrock",
		SANDSTONE: "sandstone",
		TERRACOTTA: "terracotta",
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
// A colour each grey picture is actually read through, so a tool drawing a
// preview does not have to keep its own copy of the registry. One of however
// many biomes or species wear the picture -- there is no single right answer,
// and any of them shows what the grey becomes.
const tints: Record<string, string> = {};
for (const image of IMAGES) {
	if (!image.tint) continue;
	const family = image.name.split("_")[0]!;
	const biome = Object.values(BIOME_PRESETS)
		.flat()
		.find((b) => familyOf(b.hex) === family);
	if (biome) tints[image.name] = biome.hex;
	else {
		const block =
			image.name === "wood" ? BlockType.OAK_WOOD : BlockType.OAK_LEAF;
		tints[image.name] = hexOf(BLOCK_COLORS[block]!);
	}
}

const manifest = {
	size,
	variants,
	// A tinted image is grey and is read as `tintScale * texel * the block's
	// own registry colour`; an untinted one carries its colours already.
	tintScale: TINT_SCALE,
	tinted: IMAGES.filter((i) => i.tint).map((i) => i.name),
	tints,
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
