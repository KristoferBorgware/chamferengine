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
 * share every knob the panel shows: frequency, octaves, persistence, lacunarity
 * and offset mean the same thing whichever is chosen, and what differs between
 * them is what the noise is laid on.
 *
 * The seed is the world's own, the one thing a person types. Everything drawn
 * from it -- the ground here, and the droplets that erode it -- moves together
 * when it changes, so one word is one planet.
 */
export function landformHeight(
	grid: CoarseGrid,
	seed: number,
	options: CoarseMapOptions = {},
): Float64Array {
	const s = { ...COARSE_MAP_DEFAULTS, ...options };
	switch (s.landform) {
		case "warped":
			return warpedHeight(
				grid,
				seed,
				s.frequency,
				s.octaves,
				s.persistence,
				s.lacunarity,
				s.offsetX,
				s.offsetY,
				s.ridge,
				s.warpAmplitude,
				s.warpFrequency,
			);
		case "grown":
			return grownHeight(
				grid,
				seed,
				s.creation,
				s.island,
				s.growthWeight,
				s.frequency,
				s.octaves,
				s.persistence,
				s.lacunarity,
				s.offsetX,
				s.offsetY,
				s.ridge,
			);
		case "plates":
			return plateHeight(
				grid,
				seed,
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
				s.ridge,
			);
		default:
			return noiseHeight(
				grid,
				seed,
				s.frequency,
				s.octaves,
				s.persistence,
				s.lacunarity,
				s.offsetX,
				s.offsetY,
				s.ridge,
			);
	}
}
