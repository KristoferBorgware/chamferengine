import { BlockType } from "./BlockType.js";
import { hash3 } from "../noise/hash3.js";

/** Offset from the world seed, so the speckle does not follow the terrain. */
const COLOR_SEED_OFFSET = 3;

/** How far a cell's color may drift from its type's base, per channel. */
const SPECKLE = 0.06;

/** The base color of each block type, as linear red, green and blue. */
const BASE: Readonly<Record<number, readonly [number, number, number]>> = {
	[BlockType.AIR]: [0, 0, 0],
	[BlockType.STONE]: [0.42, 0.42, 0.45],
	[BlockType.DIRT]: [0.36, 0.26, 0.17],
	[BlockType.GRASS]: [0.26, 0.44, 0.19],
	[BlockType.SAND]: [0.76, 0.7, 0.5],
	[BlockType.SNOW]: [0.92, 0.94, 0.97],
	[BlockType.WATER]: [0.12, 0.32, 0.55],
};

/**
 * One flat color for a cell, written into three slots of a vertex buffer.
 *
 * The type sets the color and the cell's own address moves it by a fraction of
 * a shade, which breaks up a hillside without a texture, a lookup or a second
 * pass. The offset comes from the integer hash, so a cell is the same color on
 * every machine and on every frame.
 */
export function blockColor(
	block: number,
	face: number,
	i: number,
	j: number,
	seed: number,
	out: Float32Array,
	at: number,
): void {
	const base = BASE[block] ?? BASE[BlockType.STONE]!;
	const noise =
		hash3(face * 8191 + i, j, i ^ j, (seed + COLOR_SEED_OFFSET) | 0) - 0.5;
	const shade = 1 + noise * 2 * SPECKLE;
	out[at] = base[0] * shade;
	out[at + 1] = base[1] * shade;
	out[at + 2] = base[2] * shade;
}
