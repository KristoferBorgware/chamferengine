/**
 * The block types the generator writes.
 *
 * A number rather than a name, and the number is what a chunk stores and what a
 * delta record carries. The list is append only and a number is never reused:
 * a store written by an older build holds numbers assigned here, and its own
 * copy of the names is what says whether they still mean the same thing.
 */
export const BlockType = {
	AIR: 0,
	STONE: 1,
	DIRT: 2,
	GRASS: 3,
	SAND: 4,
	SNOW: 5,
	WATER: 6,
	BEDROCK: 7,

	// **Vegetation is blocks, the way the ground is.** A plant is grown as
	// geometry and written into the same grid, so what it leaves behind is a
	// block type with a name, a colour and a place in this registry -- not a
	// second kind of thing drawn beside the world.
	//
	// **A wood and a leaf for each species**, because a forest of one brown and
	// one green is a forest with no species in it: a birch trunk is nearly
	// white where a pine's is dark, and the two stand in the same wood.
	CUSTOM_WOOD: 8,
	CUSTOM_LEAF: 9,
	PINE_WOOD: 10,
	PINE_LEAF: 11,
	SPRUCE_WOOD: 12,
	SPRUCE_LEAF: 13,
	OAK_WOOD: 14,
	OAK_LEAF: 15,
	BIRCH_WOOD: 16,
	BIRCH_LEAF: 17,
	WILLOW_WOOD: 18,
	WILLOW_LEAF: 19,
	PALM_WOOD: 20,
	PALM_LEAF: 21,
	BAOBAB_WOOD: 22,
	BAOBAB_LEAF: 23,
	REDWOOD_WOOD: 24,
	REDWOOD_LEAF: 25,
	BUSH_WOOD: 26,
	BUSH_LEAF: 27,
	HEATHER_WOOD: 28,
	HEATHER_LEAF: 29,
	DEADWOOD_WOOD: 30,
	DEADWOOD_LEAF: 31,
	CACTUS_WOOD: 32,
	CACTUS_LEAF: 33,
	// **A biome owns the ground it builds.** The biome model names the kind of
	// place a cell is -- shore, valley, lowland, slope, plateau or peak, and
	// which climate of that kind -- and the surface block is that name made
	// material. One type per biome, so a save, a picture and a shader all say
	// which biome built a cell by reading the block alone.
	ICY_SHORE_GROUND: 34,
	STONY_SHORE_GROUND: 35,
	BEACH_GROUND: 36,
	FROZEN_VALLEY_GROUND: 37,
	SWAMP_GROUND: 38,
	DRY_BASIN_GROUND: 39,
	TUNDRA_GROUND: 40,
	TAIGA_GROUND: 41,
	STEPPE_GROUND: 42,
	GRASSLAND_GROUND: 43,
	DESERT_GROUND: 44,
	RAINFOREST_GROUND: 45,
	SNOWY_SLOPES_GROUND: 46,
	GROVE_GROUND: 47,
	DRY_SLOPE_GROUND: 48,
	FROZEN_PLATEAU_GROUND: 49,
	HIGHLAND_STEPPE_GROUND: 50,
	BADLANDS_GROUND: 51,
	JAGGED_PEAKS_GROUND: 52,
	STONY_PEAKS_GROUND: 53,
	ALPINE_FOREST_GROUND: 54,

	// The Holdridge life-zone set, its own blocks for the same reason. Two
	// presets may not share a number: a world painted by one and reopened
	// under the other would silently rename its ground.
	HOLDRIDGE_POLAR_DESERT_GROUND: 55,
	HOLDRIDGE_DRY_TUNDRA_GROUND: 56,
	HOLDRIDGE_MOIST_TUNDRA_GROUND: 57,
	HOLDRIDGE_WET_TUNDRA_GROUND: 58,
	HOLDRIDGE_RAIN_TUNDRA_GROUND: 59,
	HOLDRIDGE_BOREAL_DESERT_GROUND: 60,
	HOLDRIDGE_DRY_SCRUB_GROUND: 61,
	HOLDRIDGE_BOREAL_MOIST_FOREST_GROUND: 62,
	HOLDRIDGE_BOREAL_WET_FOREST_GROUND: 63,
	HOLDRIDGE_BOREAL_RAIN_FOREST_GROUND: 64,
	HOLDRIDGE_DESERT_SCRUB_GROUND: 65,
	HOLDRIDGE_STEPPE_GROUND: 66,
	HOLDRIDGE_MOIST_FOREST_GROUND: 67,
	HOLDRIDGE_WET_FOREST_GROUND: 68,
	HOLDRIDGE_TEMPERATE_RAIN_FOREST_GROUND: 69,
	HOLDRIDGE_SUBTROPICAL_DESERT_GROUND: 70,
	HOLDRIDGE_THORN_WOODLAND_GROUND: 71,
	HOLDRIDGE_DRY_FOREST_GROUND: 72,
	HOLDRIDGE_SUBTROPICAL_MOIST_FOREST_GROUND: 73,
	HOLDRIDGE_TROPICAL_DESERT_GROUND: 74,
	HOLDRIDGE_TROPICAL_DRY_FOREST_GROUND: 75,
	HOLDRIDGE_TROPICAL_WET_FOREST_GROUND: 76,
	HOLDRIDGE_TROPICAL_RAIN_FOREST_GROUND: 77,
} as const;

/**
 * The names a store carries beside the numbers, in the order the numbers were
 * assigned.
 *
 * Never read while playing. They sit in the store so that one written by an
 * older build can say what its own numbers meant, and so a build whose list has
 * been reordered is refused rather than reading a wall as dirt.
 */
export const BLOCK_NAMES: readonly string[] = [
	"chamfer:air",
	"chamfer:stone",
	"chamfer:dirt",
	"chamfer:grass",
	"chamfer:sand",
	"chamfer:snow",
	"chamfer:water",
	"chamfer:bedrock",
	"chamfer:custom_wood",
	"chamfer:custom_leaf",
	"chamfer:pine_wood",
	"chamfer:pine_leaf",
	"chamfer:spruce_wood",
	"chamfer:spruce_leaf",
	"chamfer:oak_wood",
	"chamfer:oak_leaf",
	"chamfer:birch_wood",
	"chamfer:birch_leaf",
	"chamfer:willow_wood",
	"chamfer:willow_leaf",
	"chamfer:palm_wood",
	"chamfer:palm_leaf",
	"chamfer:baobab_wood",
	"chamfer:baobab_leaf",
	"chamfer:redwood_wood",
	"chamfer:redwood_leaf",
	"chamfer:bush_wood",
	"chamfer:bush_leaf",
	"chamfer:heather_wood",
	"chamfer:heather_leaf",
	"chamfer:deadwood_wood",
	"chamfer:deadwood_leaf",
	"chamfer:cactus_wood",
	"chamfer:cactus_leaf",
	"chamfer:icy_shore_ground",
	"chamfer:stony_shore_ground",
	"chamfer:beach_ground",
	"chamfer:frozen_valley_ground",
	"chamfer:swamp_ground",
	"chamfer:dry_basin_ground",
	"chamfer:tundra_ground",
	"chamfer:taiga_ground",
	"chamfer:steppe_ground",
	"chamfer:grassland_ground",
	"chamfer:desert_ground",
	"chamfer:rainforest_ground",
	"chamfer:snowy_slopes_ground",
	"chamfer:grove_ground",
	"chamfer:dry_slope_ground",
	"chamfer:frozen_plateau_ground",
	"chamfer:highland_steppe_ground",
	"chamfer:badlands_ground",
	"chamfer:jagged_peaks_ground",
	"chamfer:stony_peaks_ground",
	"chamfer:alpine_forest_ground",
	"chamfer:holdridge_polar_desert_ground",
	"chamfer:holdridge_dry_tundra_ground",
	"chamfer:holdridge_moist_tundra_ground",
	"chamfer:holdridge_wet_tundra_ground",
	"chamfer:holdridge_rain_tundra_ground",
	"chamfer:holdridge_boreal_desert_ground",
	"chamfer:holdridge_dry_scrub_ground",
	"chamfer:holdridge_boreal_moist_forest_ground",
	"chamfer:holdridge_boreal_wet_forest_ground",
	"chamfer:holdridge_boreal_rain_forest_ground",
	"chamfer:holdridge_desert_scrub_ground",
	"chamfer:holdridge_steppe_ground",
	"chamfer:holdridge_moist_forest_ground",
	"chamfer:holdridge_wet_forest_ground",
	"chamfer:holdridge_temperate_rain_forest_ground",
	"chamfer:holdridge_subtropical_desert_ground",
	"chamfer:holdridge_thorn_woodland_ground",
	"chamfer:holdridge_dry_forest_ground",
	"chamfer:holdridge_subtropical_moist_forest_ground",
	"chamfer:holdridge_tropical_desert_ground",
	"chamfer:holdridge_tropical_dry_forest_ground",
	"chamfer:holdridge_tropical_wet_forest_ground",
	"chamfer:holdridge_tropical_rain_forest_ground",
];

export type BlockType = (typeof BlockType)[keyof typeof BlockType];

/**
 * Whether a block stops a player.
 *
 * Water is a block like any other and is drawn like any other. It is the one
 * type that does not collide, so a player falls through it and floats by a
 * separate test on the cell they are in.
 *
 * **A leaf stops a player.** A canopy is a shell of blocks like any other, and
 * walking through one is a decision nobody has taken -- what a bench asks
 * instead is how much ground that leaves reachable.
 */
export function isSolid(block: BlockType): boolean {
	return block !== BlockType.AIR && block !== BlockType.WATER;
}

/** Whether a block is drawn with a blend. */
export function isTranslucent(block: BlockType): boolean {
	return block === BlockType.WATER;
}

/**
 * Whether a player may break a block or place one over it.
 *
 * The crust is a shell: it runs from the planet's tallest ground down a fixed
 * number of layers, and under the last one there is no world. That layer is
 * bedrock, and refusing it here is what keeps a hole from opening through the
 * bottom of the planet into space -- the ray walk, gravity and the mesher all
 * assume a column has a bottom.
 *
 * A type rather than a layer number, so the refusal is something a player can
 * see and learn by trying once.
 */
export function isBreakable(block: BlockType): boolean {
	return block !== BlockType.BEDROCK;
}
