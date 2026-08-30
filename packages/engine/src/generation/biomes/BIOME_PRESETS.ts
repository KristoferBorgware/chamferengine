import type { BiomeDef } from "./BiomeDef.js";
import { ANY_LANDFORM } from "./Landform.js";
import { BlockType } from "../terrain/BlockType.js";

/**
 * Holdridge's own dots, each filed under the landform it stands on.
 *
 * **Grouped by temperature, which is already an altitude band** (doc
 * comment below): the four tundra zones and the polar dot are the coldest
 * quarter and go to `peaks`; the boreal zones are the next-coldest and go
 * to `plateau`; the temperate zones sit on `slopes`; and the warm zones
 * split between `lowlands` (the driest of them, Subtropical desert and
 * Tropical desert included) and `valleys` (the wettest). `shore` takes one
 * zone from each of the four warmer temperature tiers, all on the wet side
 * of their tier -- the reading a coastline actually takes at any latitude.
 * Every group keeps at least three zones, so a landform is never one dot
 * repeated over the whole planet.
 */
const HOLDRIDGE: readonly BiomeDef[] = [
	{
		name: "Polar desert",
		hex: "f2f4f6",
		t: 0.06,
		h: 0.5,
		landform: "peaks",
		block: BlockType.HOLDRIDGE_POLAR_DESERT_GROUND,
	},
	{
		name: "Dry tundra",
		hex: "8d8f86",
		t: 0.24,
		h: 0.25,
		landform: "peaks",
		block: BlockType.HOLDRIDGE_DRY_TUNDRA_GROUND,
	},
	{
		name: "Moist tundra",
		hex: "6f8c86",
		t: 0.24,
		h: 0.47,
		landform: "peaks",
		block: BlockType.HOLDRIDGE_MOIST_TUNDRA_GROUND,
	},
	{
		name: "Wet tundra",
		hex: "43809b",
		t: 0.24,
		h: 0.65,
		landform: "shore",
		block: BlockType.HOLDRIDGE_WET_TUNDRA_GROUND,
	},
	{
		name: "Rain tundra",
		hex: "2a76c0",
		t: 0.24,
		h: 0.85,
		landform: "peaks",
		block: BlockType.HOLDRIDGE_RAIN_TUNDRA_GROUND,
	},
	{
		name: "Boreal desert",
		hex: "b9a878",
		t: 0.4,
		h: 0.06,
		landform: "plateau",
		block: BlockType.HOLDRIDGE_BOREAL_DESERT_GROUND,
	},
	{
		name: "Dry scrub",
		hex: "9aa46a",
		t: 0.4,
		h: 0.24,
		landform: "plateau",
		block: BlockType.HOLDRIDGE_DRY_SCRUB_GROUND,
	},
	{
		name: "Boreal moist forest",
		hex: "7fae7a",
		t: 0.4,
		h: 0.48,
		landform: "plateau",
		block: BlockType.HOLDRIDGE_BOREAL_MOIST_FOREST_GROUND,
	},
	{
		name: "Boreal wet forest",
		hex: "57a89a",
		t: 0.4,
		h: 0.68,
		landform: "shore",
		block: BlockType.HOLDRIDGE_BOREAL_WET_FOREST_GROUND,
	},
	{
		name: "Boreal rain forest",
		hex: "35a2b8",
		t: 0.4,
		h: 0.88,
		landform: "plateau",
		block: BlockType.HOLDRIDGE_BOREAL_RAIN_FOREST_GROUND,
	},
	{
		name: "Desert scrub",
		hex: "c3c07a",
		t: 0.58,
		h: 0.14,
		landform: "slopes",
		block: BlockType.HOLDRIDGE_DESERT_SCRUB_GROUND,
	},
	{
		name: "Steppe",
		hex: "b6c46f",
		t: 0.58,
		h: 0.34,
		landform: "slopes",
		block: BlockType.HOLDRIDGE_STEPPE_GROUND,
	},
	{
		name: "Moist forest",
		hex: "86c07a",
		t: 0.58,
		h: 0.55,
		landform: "slopes",
		block: BlockType.HOLDRIDGE_MOIST_FOREST_GROUND,
	},
	{
		name: "Wet forest",
		hex: "5fbf94",
		t: 0.58,
		h: 0.75,
		landform: "slopes",
		block: BlockType.HOLDRIDGE_WET_FOREST_GROUND,
	},
	{
		name: "Temperate rain forest",
		hex: "46c2ae",
		t: 0.58,
		h: 0.93,
		landform: "slopes",
		block: BlockType.HOLDRIDGE_TEMPERATE_RAIN_FOREST_GROUND,
	},
	{
		name: "Subtropical desert",
		hex: "e8dc7a",
		t: 0.78,
		h: 0.05,
		landform: "lowlands",
		block: BlockType.HOLDRIDGE_SUBTROPICAL_DESERT_GROUND,
	},
	{
		name: "Thorn woodland",
		hex: "cfd96f",
		t: 0.78,
		h: 0.25,
		landform: "lowlands",
		block: BlockType.HOLDRIDGE_THORN_WOODLAND_GROUND,
	},
	{
		name: "Dry forest",
		hex: "a5d772",
		t: 0.78,
		h: 0.45,
		landform: "valleys",
		block: BlockType.HOLDRIDGE_DRY_FOREST_GROUND,
	},
	{
		name: "Subtropical moist forest",
		hex: "78d67f",
		t: 0.78,
		h: 0.68,
		landform: "shore",
		block: BlockType.HOLDRIDGE_SUBTROPICAL_MOIST_FOREST_GROUND,
	},
	{
		name: "Tropical desert",
		hex: "f4ef7a",
		t: 0.95,
		h: 0.04,
		landform: "lowlands",
		block: BlockType.HOLDRIDGE_TROPICAL_DESERT_GROUND,
	},
	{
		name: "Tropical dry forest",
		hex: "c9ee72",
		t: 0.95,
		h: 0.35,
		landform: "valleys",
		block: BlockType.HOLDRIDGE_TROPICAL_DRY_FOREST_GROUND,
	},
	{
		name: "Tropical wet forest",
		hex: "63ec8e",
		t: 0.95,
		h: 0.66,
		landform: "shore",
		block: BlockType.HOLDRIDGE_TROPICAL_WET_FOREST_GROUND,
	},
	{
		name: "Tropical rain forest",
		hex: "3aecb0",
		t: 0.95,
		h: 0.9,
		landform: "valleys",
		block: BlockType.HOLDRIDGE_TROPICAL_RAIN_FOREST_GROUND,
	},
];

/**
 * Holdridge's own dots again, with every landform restriction lifted.
 *
 * **`elevation`'s own terrain adaptation is a climate term, not a second
 * gate** -- `BiomeSettings.humLapse` already dries a summit's own reading,
 * so filing these zones under a landform as well would draw two borders
 * for one piece of ground: the landform grid's, on top of the climate
 * square's own. `ANY_LANDFORM` on every zone keeps `elevation` to the one
 * border, a plain Voronoi diagram over a square a summit reads further into.
 */
const HOLDRIDGE_ANY_LANDFORM: readonly BiomeDef[] = HOLDRIDGE.map((biome) => ({
	...biome,
	landform: ANY_LANDFORM,
}));

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
 * **`holdridge` is Holdridge's life zones, filed onto the same six
 * landforms `plain` uses**: a real classification of the world's vegetation
 * by temperature and rainfall, with a name for every pair, restricted the
 * way `plain` restricts its own so a hot desert cannot stand on a peak
 * however the climate noise falls. Its own chart is a triangle, not a
 * square: cold air holds little water, so the cold-and-soaking corner has
 * no zone in it and the polar dot owns that whole end. It is banded by
 * altitude as well as latitude -- the same zones stack up a mountain in the
 * tropics as run toward the pole at sea level, which is what the
 * temperature model's altitude term does, and the landform restriction is a
 * second, independent reason the same stacking holds even where the
 * climate noise alone would not have kept it there. **Read with `fit`
 * off** -- `plain`'s own dots are placed assuming the per-planet stretch,
 * but a real classification promises the same absolute reading the same
 * name on every planet, which the stretch would break.
 *
 * **`elevation` is the same zones with every landform restriction lifted,
 * and the air drying as well as cooling as the ground rises.** `holdridge`
 * keeps its terrain adaptation the way `plain` gets it, a second gate on
 * top of the climate square -- measured on the shipped default world,
 * 11.62% of adjacent land samples disagree on the biome name, against
 * `elevation`'s 2.86%, roughly a fourfold difference from the one extra
 * gate. `elevation` reads climate alone -- {@link BiomeSettings.humLapse}
 * is a term of the square itself, so a summit reads colder and drier
 * without a second border being drawn on top
 * of the first.
 */
export const BIOME_PRESETS: Record<string, readonly BiomeDef[]> = {
	plain: [
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
	],
	holdridge: HOLDRIDGE,
	elevation: HOLDRIDGE_ANY_LANDFORM,
};

/** The set a world starts with when nothing chooses one. */
export const DEFAULT_BIOMES: readonly BiomeDef[] = BIOME_PRESETS["plain"]!;
