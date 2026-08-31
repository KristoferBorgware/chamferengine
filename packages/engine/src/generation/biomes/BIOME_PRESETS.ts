import type { BiomeDef } from "./BiomeDef.js";
import { ANY_LANDFORM } from "./Landform.js";
import { BlockType } from "../terrain/BlockType.js";

/**
 * The twenty-one grounds a world is built from.
 *
 * **Climate names the biome, and the terrain reaches it only through the air
 * getting colder and drier with height.** Sixteen of these are filed under no
 * landform at all: one diagram, read over the whole planet, with the two
 * elevation lapses doing the banding. The alternative -- filing each ground
 * to one landform, and asking the terrain which ground a place is before
 * asking the climate anything -- draws a boundary wherever the relief curve
 * crosses a threshold, and the relief curve changes hillside to hillside.
 * Measured over four seeds at one-degree steps, that reads `20.17%` of
 * neighbouring land samples disagreeing about which biome they are in,
 * against **`7.36%`** for this table.
 *
 * **Every name says a climate, and none says a landform.** Ice sheet,
 * Permafrost, Snowfield, Prairie, Scrubland and Savanna could each have been
 * named for the ground they stand on, and a name carrying a landform would
 * tell a player something untrue as soon as that ground turned up in a
 * valley.
 *
 * **The sixteen are placed where the readings are, and the placement was
 * solved rather than chosen.** An even grid is the obvious layout and it is
 * not a balanced one: the readings are noise stacks summed and divided, so
 * they pile in the middle and thin toward every edge. Four ways of placing
 * them were measured against the share of land each ground takes:
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
 * wrong tool, at `5.6 : 1`: it equalises a cell's spread, not its share.
 * What that leaves is a layout with no grid left in it -- nothing is a row of
 * equal temperature, no two dots share a humidity, and no four biomes meet at
 * a point.
 *
 * **The driest ground on the planet is warm rather than hot**, which is why
 * Desert sits in the fourth band and Scrubland in the fifth. That is the dry
 * belts arriving: the equator is where the air rises wet, and it comes back
 * down a little way off it, so the arid latitude is not the hottest one.
 * Earth's is not either.
 *
 * **The other five are filed to a landform, because a landform is the whole
 * of what they are.** Sand, shingle, sea ice and bare grey stone are a
 * shoreline and a summit rather than a climate: a beach is where the land
 * meets the water, and no reading of the air can say that. Each is placed
 * inside its own landform's measured cloud rather than among the sixteen.
 * The three shore grounds take the coast outright, by the rule in
 * `allowedBiomes`.
 *
 * **Badlands is not among them.** Red rock reads like a material and is not
 * one: it is what an arid climate does to stone, which makes it a climate the
 * same way a desert is. Filed to the plateau it drew the shoulders of every
 * ridge as a red ribbon rather than a place, because `plateau` is a reading
 * of the relief curve and anything filed to it traces relief.
 */
export const PLAIN: readonly BiomeDef[] = [
	{
		name: "Ice sheet",
		hex: "e2eaf2",
		t: 0.08,
		h: 0.26,
		landform: ANY_LANDFORM,
		block: BlockType.FROZEN_PLATEAU_GROUND,
	},
	{
		name: "Permafrost",
		hex: "cfdce6",
		t: 0.12,
		h: 0.55,
		landform: ANY_LANDFORM,
		block: BlockType.FROZEN_VALLEY_GROUND,
	},
	{
		name: "Snowfield",
		hex: "dce6ee",
		t: 0.22,
		h: 0.74,
		landform: ANY_LANDFORM,
		block: BlockType.SNOWY_SLOPES_GROUND,
	},
	{
		name: "Tundra",
		hex: "9fae95",
		t: 0.23,
		h: 0.45,
		landform: ANY_LANDFORM,
		block: BlockType.TUNDRA_GROUND,
	},
	{
		name: "Alpine forest",
		hex: "46705a",
		t: 0.27,
		h: 0.71,
		landform: ANY_LANDFORM,
		block: BlockType.ALPINE_FOREST_GROUND,
	},
	{
		name: "Taiga",
		hex: "3d6b63",
		t: 0.32,
		h: 0.95,
		landform: ANY_LANDFORM,
		block: BlockType.TAIGA_GROUND,
	},
	{
		name: "Steppe",
		hex: "a8a05e",
		t: 0.58,
		h: 0.4,
		landform: ANY_LANDFORM,
		block: BlockType.STEPPE_GROUND,
	},
	{
		name: "Prairie",
		hex: "b0ab6a",
		t: 0.46,
		h: 0.77,
		landform: ANY_LANDFORM,
		block: BlockType.HIGHLAND_STEPPE_GROUND,
	},
	{
		name: "Grove",
		hex: "5f8a5c",
		t: 0.49,
		h: 0.95,
		landform: ANY_LANDFORM,
		block: BlockType.GROVE_GROUND,
	},
	{
		name: "Desert",
		hex: "e8c44a",
		t: 0.68,
		h: 0,
		landform: ANY_LANDFORM,
		block: BlockType.DESERT_GROUND,
		underlay: BlockType.SANDSTONE,
	},
	{
		name: "Grassland",
		hex: "93a95e",
		t: 0.71,
		h: 0.44,
		landform: ANY_LANDFORM,
		block: BlockType.GRASSLAND_GROUND,
	},
	{
		name: "Swamp",
		hex: "4e5f33",
		t: 0.55,
		h: 0.78,
		landform: ANY_LANDFORM,
		block: BlockType.SWAMP_GROUND,
	},
	{
		name: "Badlands",
		hex: "c06a3a",
		t: 0.82,
		h: 0.18,
		landform: ANY_LANDFORM,
		block: BlockType.BADLANDS_GROUND,
		underlay: BlockType.TERRACOTTA,
	},
	{
		name: "Scrubland",
		hex: "b08a55",
		t: 0.85,
		h: 0.44,
		landform: ANY_LANDFORM,
		block: BlockType.DRY_SLOPE_GROUND,
	},
	{
		name: "Savanna",
		hex: "c9b06a",
		t: 0.97,
		h: 0.62,
		landform: ANY_LANDFORM,
		block: BlockType.DRY_BASIN_GROUND,
	},
	{
		name: "Rainforest",
		hex: "2f9e2f",
		t: 0.94,
		h: 0.85,
		landform: ANY_LANDFORM,
		block: BlockType.RAINFOREST_GROUND,
	},
	{
		name: "Icy shore",
		hex: "d8e4ec",
		t: 0.3,
		h: 0.75,
		landform: "shore",
		block: BlockType.ICY_SHORE_GROUND,
	},
	{
		name: "Stony shore",
		hex: "8e9298",
		t: 0.57,
		h: 0.82,
		landform: "shore",
		block: BlockType.STONY_SHORE_GROUND,
	},
	{
		name: "Beach",
		hex: "e6d9a8",
		t: 0.85,
		h: 0.9,
		landform: "shore",
		block: BlockType.BEACH_GROUND,
	},
	{
		name: "Jagged peaks",
		hex: "e4ebf2",
		t: 0.12,
		h: 0.25,
		landform: "peaks",
		block: BlockType.JAGGED_PEAKS_GROUND,
	},
	{
		name: "Stony peaks",
		hex: "8d8f94",
		t: 0.3,
		h: 0.1,
		landform: "peaks",
		block: BlockType.STONY_PEAKS_GROUND,
	},
];

/**
 * The biome sets a world can start from.
 *
 * One set, and the record is what a link names and what the panel's `Start
 * from` offers -- a shape that costs nothing while there is one of them and
 * is the whole of what a second would need.
 *
 * **Its readings are stretched through one constant span** ({@link
 * LAPSED_FIT}) rather than a stretch measured from each planet's own land. A
 * measured stretch means two worlds name one raw reading two different
 * biomes; mapping the raw range straight through means the readings cluster
 * in the middle and the corners are ground nobody stands on. A constant
 * measured over many worlds keeps both.
 */
export const BIOME_PRESETS: Record<string, readonly BiomeDef[]> = {
	plain: PLAIN,
};

/** The one a link falls back to, and the one a fresh world opens on. */
export const DEFAULT_PRESET = "plain";

/** The set a world starts with when nothing chooses one. */
export const DEFAULT_BIOMES: readonly BiomeDef[] = PLAIN;
