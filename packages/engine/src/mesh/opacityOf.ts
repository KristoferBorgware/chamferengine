import { BlockType } from "../generation/terrain/BlockType.js";
import { isPlantLeaf } from "../generation/plants/PLANT_BLOCKS.js";

/**
 * A block a look reaches through the holes in.
 *
 * **A fourth level rather than a wider water.** Air, water and stone are
 * ordered by how much they hide, and a face is drawn where one cell hides more
 * than the next -- one comparison, and it puts a seabed under the ocean and
 * never draws water against water. A cutout block does not fit that order at
 * all: it hides most of what is behind it and lets a fifth of it through, so
 * against another cutout it must draw and against stone it must draw, which no
 * value on the same scale gives. So it sits off the end of the scale and
 * {@link showsFace} names it rather than comparing it.
 */
export const CUTOUT = 3;

/**
 * How much a block hides what is behind it: 0 for air, 1 for water, 2 for
 * everything solid, and {@link CUTOUT} for a leaf drawn with holes in it.
 *
 * A face is drawn between two cells when the first hides more than the second,
 * and that one comparison covers every case but the cutout. Stone against water
 * draws a stone face, so a seabed is visible through the ocean. Water against
 * stone does not draw a water face, so the two never overlap. Water against
 * water draws nothing, which is what takes 12,717,512 naive faces down to
 * 113,455.
 *
 * `seeThrough` is off by default, and then a leaf is solid -- which is what
 * every caller outside the mesher wants, because a leaf a player walks into is
 * a block whatever its picture does.
 */
export function opacityOf(block: number, seeThrough = false): number {
	if (block === BlockType.AIR) return 0;
	if (block === BlockType.WATER) return 1;
	if (seeThrough && isPlantLeaf(block)) return CUTOUT;
	return 2;
}
