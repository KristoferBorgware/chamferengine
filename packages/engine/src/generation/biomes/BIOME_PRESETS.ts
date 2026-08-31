import type { BiomeDef } from "./BiomeDef.js";
import { ANY_LANDFORM } from "./Landform.js";
import { BlockType } from "../terrain/BlockType.js";

/**
 * Holdridge's twenty-three life zones, on any ground.
 *
 * **A life zone is a climate, so it is filed under no landform.** Holdridge
 * classifies vegetation by temperature and rainfall and says nothing about
 * what a place is made of, so every zone is allowed everywhere and one
 * diagram is read over the whole planet. What that leaves out is
 * {@link SUBSTRATE}.
 */
const HOLDRIDGE: readonly BiomeDef[] = [
	{
		name: "Polar desert",
		hex: "f2f4f6",
		t: 0.06,
		h: 0.5,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_POLAR_DESERT_GROUND,
	},
	{
		name: "Dry tundra",
		hex: "8d8f86",
		t: 0.24,
		h: 0.25,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_DRY_TUNDRA_GROUND,
	},
	{
		name: "Moist tundra",
		hex: "6f8c86",
		t: 0.24,
		h: 0.47,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_MOIST_TUNDRA_GROUND,
	},
	{
		name: "Wet tundra",
		hex: "43809b",
		t: 0.24,
		h: 0.65,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_WET_TUNDRA_GROUND,
	},
	{
		name: "Rain tundra",
		hex: "2a76c0",
		t: 0.24,
		h: 0.85,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_RAIN_TUNDRA_GROUND,
	},
	{
		name: "Boreal desert",
		hex: "b9a878",
		t: 0.4,
		h: 0.06,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_BOREAL_DESERT_GROUND,
	},
	{
		name: "Dry scrub",
		hex: "9aa46a",
		t: 0.4,
		h: 0.24,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_DRY_SCRUB_GROUND,
	},
	{
		name: "Boreal moist forest",
		hex: "7fae7a",
		t: 0.4,
		h: 0.48,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_BOREAL_MOIST_FOREST_GROUND,
	},
	{
		name: "Boreal wet forest",
		hex: "57a89a",
		t: 0.4,
		h: 0.68,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_BOREAL_WET_FOREST_GROUND,
	},
	{
		name: "Boreal rain forest",
		hex: "35a2b8",
		t: 0.4,
		h: 0.88,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_BOREAL_RAIN_FOREST_GROUND,
	},
	{
		name: "Desert scrub",
		hex: "c3c07a",
		t: 0.58,
		h: 0.14,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_DESERT_SCRUB_GROUND,
	},
	{
		name: "Steppe",
		hex: "b6c46f",
		t: 0.58,
		h: 0.34,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_STEPPE_GROUND,
	},
	{
		name: "Moist forest",
		hex: "86c07a",
		t: 0.58,
		h: 0.55,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_MOIST_FOREST_GROUND,
	},
	{
		name: "Wet forest",
		hex: "5fbf94",
		t: 0.58,
		h: 0.75,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_WET_FOREST_GROUND,
	},
	{
		name: "Temperate rain forest",
		hex: "46c2ae",
		t: 0.58,
		h: 0.93,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_TEMPERATE_RAIN_FOREST_GROUND,
	},
	{
		name: "Subtropical desert",
		hex: "e8dc7a",
		t: 0.78,
		h: 0.05,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_SUBTROPICAL_DESERT_GROUND,
		underlay: BlockType.SANDSTONE,
	},
	{
		name: "Thorn woodland",
		hex: "cfd96f",
		t: 0.78,
		h: 0.25,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_THORN_WOODLAND_GROUND,
	},
	{
		name: "Dry forest",
		hex: "a5d772",
		t: 0.78,
		h: 0.45,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_DRY_FOREST_GROUND,
	},
	{
		name: "Subtropical moist forest",
		hex: "78d67f",
		t: 0.78,
		h: 0.68,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_SUBTROPICAL_MOIST_FOREST_GROUND,
	},
	{
		name: "Tropical desert",
		hex: "f4ef7a",
		t: 0.95,
		h: 0.04,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_TROPICAL_DESERT_GROUND,
		underlay: BlockType.SANDSTONE,
	},
	{
		name: "Tropical dry forest",
		hex: "c9ee72",
		t: 0.95,
		h: 0.35,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_TROPICAL_DRY_FOREST_GROUND,
	},
	{
		name: "Tropical wet forest",
		hex: "63ec8e",
		t: 0.95,
		h: 0.66,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_TROPICAL_WET_FOREST_GROUND,
	},
	{
		name: "Tropical rain forest",
		hex: "3aecb0",
		t: 0.95,
		h: 0.9,
		landform: ANY_LANDFORM,
		block: BlockType.HOLDRIDGE_TROPICAL_RAIN_FOREST_GROUND,
	},
];

/**
 * The five grounds named by what they are made of rather than what grows on
 * them.
 *
 * **Holdridge cannot say "bare rock", because it is a classification of
 * vegetation.** Every one of its twenty-three zones names a plant community,
 * so a place with no plant community -- a strand, a red mesa, a stone summit
 * -- has no zone to land on and takes whichever life zone the climate reads
 * there instead. These are the materials that leaves out: **sand**,
 * **shingle**, **ice**, **red rock** and **grey stone**.
 *
 * **Each is filed under the landform it belongs on, which is what makes the
 * landform grid and the two shore knobs reach this table at all.** How much
 * plateau and summit a world has is what decides how much Badlands and Stony
 * peaks it has; `shoreHeight` and `shoreReach` decide how wide the strand
 * runs.
 *
 * **The three placed on the summits and plateaus are dots among the life
 * zones; the three on the shore replace them** ({@link allowedBiomes}).
 * Stony peaks reads the cold, dry corner a summit is already in, so as one
 * more dot it takes **46%** of the peaks and the rest stay tundra. Badlands
 * has no such corner to itself -- a plateau is dry and Holdridge already
 * files four deserts there -- so it stays a **0.11%** landmark rather than a
 * band, and the landform grid is the knob that grows it. The shore is where
 * an added dot fails outright: a coast reads temperate and damp, the most
 * crowded part of the square, and a beach merely added won `7.3%` of the
 * shore at its best placement.
 *
 * The three shore dots are spread along the temperature a shore actually
 * reads -- measured over four seeds, its tenth to ninetieth percentile runs
 * `0.21` to `0.92` -- so a polar coast comes out ice, a temperate one
 * shingle, and a warm one sand.
 */
const SUBSTRATE: readonly BiomeDef[] = [
	{
		name: "Icy shore",
		hex: "d8e4ec",
		t: 0.28,
		h: 0.52,
		landform: "shore",
		block: BlockType.ICY_SHORE_GROUND,
	},
	{
		name: "Stony shore",
		hex: "8e9298",
		t: 0.52,
		h: 0.48,
		landform: "shore",
		block: BlockType.STONY_SHORE_GROUND,
	},
	{
		name: "Beach",
		hex: "e6d9a8",
		t: 0.8,
		h: 0.62,
		landform: "shore",
		block: BlockType.BEACH_GROUND,
		underlay: BlockType.SANDSTONE,
	},
	{
		name: "Badlands",
		hex: "c06a3a",
		t: 0.7,
		h: 0.16,
		landform: "plateau",
		block: BlockType.BADLANDS_GROUND,
		underlay: BlockType.TERRACOTTA,
	},
	{
		name: "Stony peaks",
		hex: "8d8f94",
		t: 0.21,
		h: 0.18,
		landform: "peaks",
		block: BlockType.STONY_PEAKS_GROUND,
	},
];

/**
 * The twenty-one grounds `plain` names, in the order they were written.
 *
 * Pulled out of {@link BIOME_PRESETS} so that {@link PLAIN_BANDED} can read
 * its colors, blocks and underlays rather than repeating them: the two sets
 * are the same materials laid out two ways, and a material described twice
 * is a material that drifts.
 */
const PLAIN: readonly BiomeDef[] = [
	{
		name: "Icy shore",
		hex: "d8e4ec",
		t: 0.3,
		h: 0.6,
		landform: "shore",
		block: BlockType.ICY_SHORE_GROUND,
	},
	{
		name: "Stony shore",
		hex: "8e9298",
		t: 0.62,
		h: 0.45,
		landform: "shore",
		block: BlockType.STONY_SHORE_GROUND,
	},
	{
		name: "Beach",
		hex: "e6d9a8",
		t: 0.9,
		h: 0.8,
		landform: "shore",
		block: BlockType.BEACH_GROUND,
	},
	{
		name: "Frozen valley",
		hex: "cfdce6",
		t: 0.17,
		h: 0.49,
		landform: "valleys",
		block: BlockType.FROZEN_VALLEY_GROUND,
	},
	{
		name: "Swamp",
		hex: "4e5f33",
		t: 0.45,
		h: 0.78,
		landform: "valleys",
		block: BlockType.SWAMP_GROUND,
	},
	{
		name: "Dry basin",
		hex: "c9b06a",
		t: 0.7,
		h: 0.25,
		landform: "valleys",
		block: BlockType.DRY_BASIN_GROUND,
	},
	{
		name: "Tundra",
		hex: "9fae95",
		t: 0.3,
		h: 0.28,
		landform: "lowlands",
		block: BlockType.TUNDRA_GROUND,
	},
	{
		name: "Taiga",
		hex: "3d6b63",
		t: 0.3,
		h: 0.78,
		landform: "lowlands",
		block: BlockType.TAIGA_GROUND,
	},
	{
		name: "Steppe",
		hex: "a8a05e",
		t: 0.58,
		h: 0.28,
		landform: "lowlands",
		block: BlockType.STEPPE_GROUND,
	},
	{
		name: "Grassland",
		hex: "93a95e",
		t: 0.58,
		h: 0.78,
		landform: "lowlands",
		block: BlockType.GRASSLAND_GROUND,
	},
	{
		name: "Desert",
		hex: "e8c44a",
		t: 0.84,
		h: 0.28,
		landform: "lowlands",
		block: BlockType.DESERT_GROUND,
		underlay: BlockType.SANDSTONE,
	},
	{
		name: "Rainforest",
		hex: "2f9e2f",
		t: 0.84,
		h: 0.78,
		landform: "lowlands",
		block: BlockType.RAINFOREST_GROUND,
	},
	{
		name: "Snowy slopes",
		hex: "dce6ee",
		t: 0.15,
		h: 0.63,
		landform: "slopes",
		block: BlockType.SNOWY_SLOPES_GROUND,
	},
	{
		name: "Grove",
		hex: "5f8a5c",
		t: 0.42,
		h: 0.87,
		landform: "slopes",
		block: BlockType.GROVE_GROUND,
	},
	{
		name: "Dry slope",
		hex: "b08a55",
		t: 0.79,
		h: 0.32,
		landform: "slopes",
		block: BlockType.DRY_SLOPE_GROUND,
	},
	{
		name: "Frozen plateau",
		hex: "e2eaf2",
		t: 0.25,
		h: 0.45,
		landform: "plateau",
		block: BlockType.FROZEN_PLATEAU_GROUND,
	},
	{
		name: "Highland steppe",
		hex: "b0ab6a",
		t: 0.57,
		h: 0.55,
		landform: "plateau",
		block: BlockType.HIGHLAND_STEPPE_GROUND,
	},
	{
		name: "Badlands",
		hex: "c06a3a",
		t: 0.81,
		h: 0.18,
		landform: "plateau",
		block: BlockType.BADLANDS_GROUND,
		underlay: BlockType.TERRACOTTA,
	},
	{
		name: "Jagged peaks",
		hex: "e4ebf2",
		t: 0.05,
		h: 0.45,
		landform: "peaks",
		block: BlockType.JAGGED_PEAKS_GROUND,
	},
	{
		name: "Stony peaks",
		hex: "8d8f94",
		t: 0.21,
		h: 0.18,
		landform: "peaks",
		block: BlockType.STONY_PEAKS_GROUND,
	},
	{
		name: "Alpine forest",
		hex: "46705a",
		t: 0.41,
		h: 0.62,
		landform: "peaks",
		block: BlockType.ALPINE_FOREST_GROUND,
	},
];

/**
 * One of `plain`'s grounds, moved to the climate {@link PLAIN_BANDED} wants
 * it at.
 *
 * Only `t`, `h` and `landform` are given here. Everything that says what the
 * ground **is** -- its name, its color, its block and its underlay -- comes
 * from {@link PLAIN} untouched, so the two tables can never disagree about
 * what a Beach is made of.
 */
function respaced(
	name: string,
	t: number,
	h: number,
	landform: string = ANY_LANDFORM,
): BiomeDef {
	const from = PLAIN.find((biome) => biome.name === name);
	if (!from) throw new Error(`no plain biome is named ${name}`);
	return { ...from, t, h, landform };
}

/**
 * **`plain`'s twenty-one grounds, laid out the way Holdridge lays its own
 * out**: climate names the biome, and the terrain reaches it only through the
 * air getting colder and drier with height.
 *
 * `plain` files each of its dots under one landform and asks the terrain
 * which ground a place is before it asks the climate anything, so a boundary
 * is drawn wherever the relief curve crosses a threshold -- and the relief
 * curve changes hillside to hillside. That is what makes its map read as
 * speckle: measured over four seeds at one-degree steps, `20.17%` of
 * neighbouring land samples disagree about which biome they are in, against
 * `7.87%` for the Holdridge table this one is laid out after. Fifteen of
 * `plain`'s grounds name a climate rather than a material, and those fifteen
 * are filed under no landform here. The same sweep reads **`7.43%`**.
 *
 * **They had to be respaced, not merely unfiled.** `plain` placed its dots
 * inside each landform's own measured cloud, so two filed under different
 * ground sit almost on top of each other -- Frozen valley and Frozen plateau
 * are `0.089` apart, Desert and Dry slope `0.064`. Thrown into one square
 * they would split their neighbourhood along a line no reading is stable
 * across, which is the speckle again by another route.
 *
 * **The sixteen are placed where the readings are, and the placement was
 * solved rather than chosen.** An even grid is the obvious layout and it is
 * not a balanced one: the readings are noise stacks summed and divided, so
 * they pile in the middle and thin toward every edge. Four ways of placing
 * them were measured against the share of land each ground takes, over four
 * seeds at one-degree steps:
 *
 * | placed by | widest : narrowest |
 * |---|---|
 * | an even grid | `5.4 : 1` |
 * | each axis at its own quantiles | `6.3 : 1` |
 * | each temperature band at its own | `2.4 : 1` |
 * | relaxed until the shares agree | **`1.26 : 1`** |
 *
 * The last is what ships. A cell of a plain Voronoi grows when its dot moves
 * **toward** a crowded neighbour, so the sixteen were stepped that way until
 * the counts stopped separating -- with two orderings held so no name loses
 * its meaning: the bands stay ordered by temperature, and inside a band the
 * dots stay ordered dry to wet. Lloyd relaxation was tried first and is the
 * wrong tool, at `5.6 : 1`: it equalises a cell's spread, not its share, and
 * left the same ground starved.
 *
 * **What that leaves is a layout with no grid left in it**, which is the
 * second thing it had to fix. Nothing is a row of equal temperature any
 * more, no two dots share a humidity, and no four biomes meet at a point.
 *
 * **The driest ground on the planet is warm rather than hot**, which is why
 * Desert sits in the fourth band and Dry slope in the fifth. That is the dry
 * belts arriving: the equator is where the air rises wet, and it comes back
 * down a little way off it, so the arid latitude is not the hottest one.
 * Earth's is not either.
 *
 * **The other five stay filed, because a landform is the whole of what they
 * are.** Sand, shingle, sea ice and bare grey stone are a shoreline and a
 * summit rather than a climate: a beach is where the land meets the water,
 * and no reading of the air can say that. Each is placed inside its own
 * landform's cloud rather than among the sixteen, swept over that cloud
 * rather than reasoned about, and the two peak dots take `14%` and `18%` of
 * the peaks between them. Jagged peaks is the colder and wetter of the two
 * and Stony peaks the warmer and drier, which is the right way round --
 * snow needs water and bare rock does not. The three shore grounds take the
 * coast outright, by the rule in `allowedBiomes`.
 *
 * **Badlands is not among them, and used to be.** Red rock reads like a
 * material and is not one: it is what an arid climate does to stone, which
 * makes it a climate the same way a desert is. Filed to the plateau it drew
 * the shoulders of every ridge as a red ribbon rather than a place --
 * `plateau` is a reading of the relief curve, so anything filed to it traces
 * relief instead of naming ground. Unfiled it is the hot, very dry corner of
 * the chart, and the sixteen balance better with it than the fifteen did
 * without.
 */
const PLAIN_BANDED: readonly BiomeDef[] = [
	// The coldest band. Ice at every humidity: what changes across it is how
	// much snow lies on the ice, not whether the ground is frozen.
	respaced("Frozen plateau", 0.08, 0.26),
	respaced("Frozen valley", 0.12, 0.55),
	respaced("Snowy slopes", 0.22, 0.74),

	// Cold, and something grows. It sits poleward of the dry belts, where
	// the air has not descended, so it is the wettest band on the planet.
	respaced("Tundra", 0.23, 0.45),
	respaced("Alpine forest", 0.27, 0.71),
	respaced("Taiga", 0.32, 0.95),

	// Temperate.
	respaced("Steppe", 0.58, 0.4),
	respaced("Highland steppe", 0.46, 0.77),
	respaced("Grove", 0.49, 0.95),

	// Warm, and the arid one. This is the dry belt itself, which is why the
	// driest ground on the planet is warm rather than hot -- the equator is
	// where the air rises wet, and it comes back down a little way off it.
	respaced("Desert", 0.68, 0.0),
	respaced("Grassland", 0.71, 0.44),
	respaced("Swamp", 0.55, 0.78),

	// Hot, on the equator's own side of the belt, so wetter than the band
	// under it at every humidity. Badlands is here rather than on the
	// plateau it used to be filed to: red rock is what an arid climate does
	// to stone, and filed to a relief reading it drew the shoulders of every
	// ridge as a red ribbon instead of a place.
	respaced("Badlands", 0.82, 0.18),
	respaced("Dry slope", 0.85, 0.44),
	respaced("Dry basin", 0.97, 0.62),
	respaced("Rainforest", 0.94, 0.85),

	// The five that name a material rather than a plant community, each
	// placed inside its own landform's measured cloud rather than among the
	// sixteen. The shore trio is read against itself alone, so its three
	// dots only have to separate a cold coast from a temperate one from a
	// hot one.
	respaced("Icy shore", 0.3, 0.75, "shore"),
	respaced("Stony shore", 0.57, 0.82, "shore"),
	respaced("Beach", 0.85, 0.9, "shore"),
	respaced("Jagged peaks", 0.12, 0.25, "peaks"),
	respaced("Stony peaks", 0.28, 0.2, "peaks"),
];

/**
 * The biome sets a world can start from.
 *
 * **`plain` is the shipped set: each landform's dots sit inside that ground's
 * own measured climate**, not spread evenly over a square most of it never
 * reaches. Peaks run 0.00 to 0.49 in temperature because the ground cools as
 * it rises, so a hot peak is not a rare biome, it is no biome at all; a dot
 * placed out there would never be built and the ones left would split the
 * cloud between them.
 *
 * **`plainElevation` is those same twenty-one grounds with the terrain rule
 * taken off fifteen of them** ({@link PLAIN_BANDED}): climate names the
 * biome, and the terrain reaches it only through the air getting colder and
 * drier with height. Same names, same colors, same blocks, a map with
 * regions in it rather than speckle.
 *
 * **`holdridge` is Holdridge's life zones on their own**: a real
 * classification of the world's vegetation by temperature and rainfall,
 * with a name for every pair and nothing said about landforms. Its own
 * chart is a triangle, not a square: cold air holds little water, so the
 * cold-and-soaking corner has no zone in it and the polar dot owns that
 * whole end. It is banded by altitude as well as latitude -- the same zones
 * stack up a mountain in the tropics as run toward the pole at sea level,
 * which is what the temperature model's altitude term does.
 *
 * **`elevation` is the world this project builds: those twenty-three zones,
 * the three grounds in {@link SUBSTRATE} that Holdridge has no way to name,
 * and the air drying as well as cooling with height.** Twenty-six between
 * them. What it does not carry is the eighteen of `plain`'s twenty-one that
 * a life zone already says -- `plain`'s Taiga is Boreal wet forest, its
 * Grassland is Wet forest, its Tundra is Dry tundra, and so on down to
 * Alpine forest -- so those are dropped rather than duplicated under a
 * second name. Only Beach, Badlands and Stony peaks survive the merge, and
 * they survive because sand, red rock and grey stone are materials rather
 * than plant communities. `plain`'s two underlays come across with them,
 * and Holdridge's own two deserts gain the sandstone they were missing.
 *
 * **Every set but `plain` reads one constant span** rather than the stretch
 * `plain` measures from each planet's own land, and
 * {@link fitForPreset} is which one:
 * `plain`'s dots are placed assuming that stretch, but a real
 * classification promises the same absolute reading the same name
 * everywhere, and one constant keeps that while still reaching the whole
 * chart. Measured over four seeds, all twenty-three life zones are built,
 * against eighteen when the raw range is read straight through. **Which
 * constant a table reads is decided by its humidity lapse**, because a fit
 * is measured against a climate model and drying the air with height makes
 * a different one.
 */
export const BIOME_PRESETS: Record<string, readonly BiomeDef[]> = {
	plain: PLAIN,
	plainElevation: PLAIN_BANDED,
	holdridge: HOLDRIDGE,
	elevation: [...HOLDRIDGE, ...SUBSTRATE],
};

/** The set a world starts with when nothing chooses one. */
export const DEFAULT_BIOMES: readonly BiomeDef[] = BIOME_PRESETS["plain"]!;
