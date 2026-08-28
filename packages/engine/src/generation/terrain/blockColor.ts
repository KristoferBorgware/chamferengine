import { BlockType } from "./BlockType.js";
import { PLANT_BLOCKS } from "../plants/PLANT_BLOCKS.js";
import { PLANT_SPECIES } from "../plants/PLANT_SPECIES.js";
import { hash3 } from "../noise/hash3.js";

/** Offset from the world seed, so the speckle does not follow the terrain. */
const COLOR_SEED_OFFSET = 3;

/**
 * How far a cell's color may drift from its type's base, per channel.
 *
 * Exported because it is what a caller turning the speckle off is turning off:
 * the amount is the setting, and zero is the whole of what "no speckle" means.
 */
export const SPECKLE = 0.06;

/**
 * How far a cell's colour drifts from its type's base, as a multiplier.
 *
 * **Pulled out because two places want it and only one wants a colour.** The
 * world's mesher bakes it into a vertex colour; the landscape bench draws the
 * material bands in a shader and wants the drift alone. Written twice, the two
 * would agree until either was retuned.
 *
 * The offset comes from the integer hash, so a cell takes the same shade on
 * every machine and on every frame.
 */
export function speckleShade(
	face: number,
	i: number,
	j: number,
	seed: number,
	speckle: number = SPECKLE,
): number {
	if (speckle === 0) return 1;
	const noise =
		hash3(face * 8191 + i, j, i ^ j, (seed + COLOR_SEED_OFFSET) | 0) - 0.5;
	return 1 + noise * 2 * speckle;
}

/** The base color of each block type, as linear red, green and blue. */
export const BLOCK_COLORS: Readonly<
	Record<number, readonly [number, number, number]>
> = {
	[BlockType.AIR]: [0, 0, 0],
	[BlockType.STONE]: [0.42, 0.42, 0.45],
	[BlockType.DIRT]: [0.36, 0.26, 0.17],
	[BlockType.GRASS]: [0.26, 0.44, 0.19],
	[BlockType.SAND]: [0.76, 0.7, 0.5],
	[BlockType.SNOW]: [0.92, 0.94, 0.97],
	[BlockType.WATER]: [0.12, 0.32, 0.55],
	[BlockType.BEDROCK]: [0.17, 0.16, 0.19],
	// **A plant's two colours are the species' own**, written in from the one
	// table that describes it rather than copied out here -- a registry green
	// a shade off the species green is a picture that answers a slightly
	// different question than the one asked of it.
	...Object.fromEntries(
		Object.entries(PLANT_BLOCKS).flatMap(([species, blocks]) => [
			[blocks.wood, PLANT_SPECIES[species]!.wood],
			[blocks.leaf, PLANT_SPECIES[species]!.leaf],
		]),
	),
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
	speckle: number = SPECKLE,
): void {
	const base = BLOCK_COLORS[block] ?? BLOCK_COLORS[BlockType.STONE]!;
	if (speckle === 0) {
		// **Zero is the flat block colour and nothing else.** Not a hash
		// multiplied by nothing: a cell that took no speckle should be the
		// number in the registry to the bit, so a picture of the world can be
		// compared against one.
		out[at] = base[0];
		out[at + 1] = base[1];
		out[at + 2] = base[2];
		return;
	}
	const shade = speckleShade(face, i, j, seed, speckle);
	out[at] = base[0] * shade;
	out[at + 1] = base[1] * shade;
	out[at + 2] = base[2] * shade;
}
