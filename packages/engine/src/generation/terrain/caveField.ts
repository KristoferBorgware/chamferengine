import type { NoiseCorners } from "../noise/NoiseCorners.js";
import { fbm } from "../noise/fbm.js";

/** Offset from the world seed, so caves and surface detail differ. */
const CAVE_SEED_OFFSET = 2;

/** How many octaves a passage is made of, and the memo slots a walk needs. */
export const CAVE_OCTAVES = 3;

/** The cave field's own seed, kept beside the offset so both read one line. */
export function caveFieldSeed(seed: number): number {
	return (seed + CAVE_SEED_OFFSET) | 0;
}

/**
 * What the cave field reads at one point in space.
 *
 * The reading {@link caveDensity} compares against its band, on its own so
 * anything drawing a picture of the caves reads the same number the world is
 * carved from rather than a second stack that agrees with it approximately.
 *
 * Sampled at the point's **direction times its own radius**, which is the world
 * position of the block there -- so a metre up moves the sample exactly as far
 * as a metre sideways and a passage is the same size in every direction.
 */
export function caveField(
	x: number,
	y: number,
	z: number,
	radius: number,
	seed: number,
	scale: number,
	corners: NoiseCorners | null = null,
): number {
	const f = radius / scale;
	return fbm(
		x * f,
		y * f,
		z * f,
		1,
		CAVE_OCTAVES,
		caveFieldSeed(seed),
		corners,
	);
}
