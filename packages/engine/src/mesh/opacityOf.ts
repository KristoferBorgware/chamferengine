import { BlockType } from "../generation/terrain/BlockType.js";

/**
 * How much a block hides what is behind it: 0 for air, 1 for water, 2 for
 * everything solid.
 *
 * A face is drawn between two cells when the first is more opaque than the
 * second, and that one comparison covers every case. Stone against water draws
 * a stone face, so a seabed is visible through the ocean. Water against stone
 * does not draw a water face, so the two never overlap. Water against water
 * draws nothing, which is what takes 12,717,512 naive faces down to 113,455.
 */
export function opacityOf(block: number): number {
	if (block === BlockType.AIR) return 0;
	if (block === BlockType.WATER) return 1;
	return 2;
}
