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
];

export type BlockType = (typeof BlockType)[keyof typeof BlockType];

/**
 * Whether a block stops a player.
 *
 * Water is a block like any other and is drawn like any other. It is the one
 * type that does not collide, so a player falls through it and floats by a
 * separate test on the cell they are in.
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
