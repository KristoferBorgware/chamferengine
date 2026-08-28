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
