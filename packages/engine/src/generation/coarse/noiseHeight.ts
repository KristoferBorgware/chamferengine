import type { CoarseGrid } from "./CoarseGrid.js";
import { octaveNoise } from "../noise/octaveNoise.js";

/**
 * The surface as one field of octave noise, sampled from each cell's own
 * direction in 3D.
 *
 * **One tier, not two.** The map used to sum a wide continent field and a
 * narrower relief field, each with its own frequency, octave count and
 * amplitude -- six numbers whose ratios decided the coast and none of which
 * could be turned without turning another back. The octave stack is the same
 * idea with the ratios stated once: `lacunarity` is how much narrower each
 * octave is than the one above it, and `persistence` is how much shallower.
 *
 * Sampled in 3D world space and never from a face's own `(i, j)`, which is
 * what makes the thirty face edges invisible: a cell on an edge has two names
 * and one direction, so both names give it the same height.
 *
 * The result is in `[-1, 1]` and carries no unit. `buildCoarseMap` puts sea
 * level at the percentile that leaves the asked-for land above it and scales
 * what is left into metres.
 */
export function noiseHeight(
	grid: CoarseGrid,
	seed: number,
	frequency: number,
	octaves: number,
	persistence: number,
	lacunarity: number,
	offsetX: number,
	offsetY: number,
): Float64Array {
	const height = new Float64Array(grid.count);
	for (let cell = 0; cell < grid.count; cell++)
		height[cell] = octaveNoise(
			grid.directions[cell * 3]!,
			grid.directions[cell * 3 + 1]!,
			grid.directions[cell * 3 + 2]!,
			seed,
			frequency,
			octaves,
			persistence,
			lacunarity,
			offsetX,
			offsetY,
		);
	return height;
}
