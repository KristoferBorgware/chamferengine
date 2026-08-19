import type { CoarseGrid } from "./CoarseGrid.js";
import { octaveNoise } from "../noise/octaveNoise.js";

/** Offset from the noise seed, so the push is not the field it pushes. */
const WARP_SEED_OFFSET = 11;

/**
 * The surface, with the sample point pushed about before the noise is read.
 *
 * A smooth field cut at one height draws a smooth curve, which is what rounds
 * every coast the plain field makes. Displacing the direction by a second field
 * first folds that curve without changing what is being cut: the same
 * continents, in the same places, with a coastline that wanders.
 *
 * The push is three octaves of its own, at its own frequency, and it does not
 * read the octave stack's own settings -- pushing a field by a copy of itself
 * folds it along its own features and leaves the coast where it was.
 */
export function warpedHeight(
	grid: CoarseGrid,
	seed: number,
	frequency: number,
	octaves: number,
	persistence: number,
	lacunarity: number,
	offsetX: number,
	offsetY: number,
	ridge: number,
	warpAmplitude: number,
	warpFrequency: number,
): Float64Array {
	const height = new Float64Array(grid.count);
	const warpSeed = (seed + WARP_SEED_OFFSET) | 0;
	for (let cell = 0; cell < grid.count; cell++) {
		const x = grid.directions[cell * 3]!;
		const y = grid.directions[cell * 3 + 1]!;
		const z = grid.directions[cell * 3 + 2]!;
		const wx =
			x +
			warpAmplitude *
				octaveNoise(x, y, z, warpSeed, warpFrequency, 3, 0.5, 2, 0, 0);
		const wy =
			y +
			warpAmplitude *
				octaveNoise(
					x,
					y,
					z,
					warpSeed + 1,
					warpFrequency,
					3,
					0.5,
					2,
					0,
					0,
				);
		const wz =
			z +
			warpAmplitude *
				octaveNoise(
					x,
					y,
					z,
					warpSeed + 2,
					warpFrequency,
					3,
					0.5,
					2,
					0,
					0,
				);
		height[cell] = octaveNoise(
			wx,
			wy,
			wz,
			seed,
			frequency,
			octaves,
			persistence,
			lacunarity,
			offsetX,
			offsetY,
			ridge,
		);
	}
	return height;
}
