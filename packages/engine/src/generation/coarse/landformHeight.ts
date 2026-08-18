import type { CoarseGrid } from "./CoarseGrid.js";
import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import { COARSE_MAP_DEFAULTS } from "./CoarseMapOptions.js";
import { continentHeight } from "./continentHeight.js";
import { grownHeight } from "./grownHeight.js";
import { plateHeight } from "./plateHeight.js";
import { warpedHeight } from "./warpedHeight.js";

/**
 * The surface, by whichever way this world decides where its land is.
 *
 * One place so the two builders cannot drift: everything downstream — sea
 * level, erosion, routing, the water surface — reads a height and does not care
 * which of the four made it.
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
				s.continentFrequency,
				s.continentOctaves,
				s.reliefFrequency,
				s.reliefOctaves,
				s.reliefAmplitude,
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
				s.reliefFrequency,
				s.reliefOctaves,
				s.reliefAmplitude,
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
				s.reliefFrequency,
				s.reliefOctaves,
				s.reliefAmplitude,
			);
		default:
			return continentHeight(
				grid,
				seed,
				s.continentFrequency,
				s.continentOctaves,
				s.reliefFrequency,
				s.reliefOctaves,
				s.reliefAmplitude,
			);
	}
}
