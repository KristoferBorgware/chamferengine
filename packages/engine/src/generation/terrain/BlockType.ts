/**
 * The block types v0.1.0 generates.
 *
 * A number rather than a name, and the number is what a chunk stores. Doc 27's
 * registry replaces this list when a save format exists; until then the numbers
 * are assigned here and nothing reads them off disk.
 */
export const BlockType = {
	AIR: 0,
	STONE: 1,
	DIRT: 2,
	GRASS: 3,
	SAND: 4,
	SNOW: 5,
	WATER: 6,
} as const;

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
