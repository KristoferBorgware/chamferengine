import type { CoarseGrid } from "./CoarseGrid.js";
import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import { COARSE_MAP_DEFAULTS } from "./CoarseMapOptions.js";
import { noiseHeight } from "./noiseHeight.js";
import { grownHeight } from "./grownHeight.js";
import { plateHeight } from "./plateHeight.js";
import { warpedHeight } from "./warpedHeight.js";

/**
 * The surface, by whichever way this world decides where its land is, in
 * `[-1, 1]` and carrying no unit.
 *
 * One place so the two builders cannot drift, and one octave stack so the four
 * share every knob the panel shows: seed, frequency, octaves, persistence,
 * lacunarity and offset mean the same thing whichever is chosen, and what
 * differs between them is what the noise is laid on.
 */
export function landformHeight(
	grid: CoarseGrid,
	options: CoarseMapOptions = {},
): Float64Array {
	const s = { ...COARSE_MAP_DEFAULTS, ...options };
	switch (s.landform) {
		case "warped":
			return warpedHeight(
				grid,
				s.noiseSeed,
				s.frequency,
				s.octaves,
				s.persistence,
				s.lacunarity,
				s.offsetX,
				s.offsetY,
				s.warpAmplitude,
				s.warpFrequency,
			);
		case "grown":
			return grownHeight(
				grid,
				s.noiseSeed,
				s.creation,
				s.island,
				s.growthWeight,
				s.frequency,
				s.octaves,
				s.persistence,
				s.lacunarity,
				s.offsetX,
				s.offsetY,
			);
		case "plates":
			return plateHeight(
				grid,
				s.noiseSeed,
				s.plates,
				s.oceanShare,
				s.biasWeight,
				s.upliftWeight,
				s.upliftReach,
				s.frequency,
				s.octaves,
				s.persistence,
				s.lacunarity,
				s.offsetX,
				s.offsetY,
			);
		default:
			return noiseHeight(
				grid,
				s.noiseSeed,
				s.frequency,
				s.octaves,
				s.persistence,
				s.lacunarity,
				s.offsetX,
				s.offsetY,
			);
	}
}
