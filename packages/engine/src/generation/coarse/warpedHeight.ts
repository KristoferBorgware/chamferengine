import type { CoarseGrid } from "./CoarseGrid.js";
import { fbm } from "../noise/fbm.js";

/** Offsets from the world seed, so no two fields here share features. */
const CONTINENT_SEED_OFFSET = 0;
const RELIEF_SEED_OFFSET = 1;
const WARP_SEED_OFFSET = 11;

/**
 * The surface, with the sample point pushed about before the continents are
 * read.
 *
 * A smooth field cut at one height draws a smooth curve, which is what rounds
 * every coast the plain two-tier field makes. Displacing the direction by a
 * second field first folds that curve without changing what is being cut: the
 * same continents, in the same places, with a coastline that wanders.
 *
 * The push is applied to the continent tier alone. Warping the relief as well
 * moves the hills without moving the coast, which costs three more `fbm`
 * evaluations to change something nobody is looking at.
 */
export function warpedHeight(
	grid: CoarseGrid,
	seed: number,
	continentFrequency: number,
	continentOctaves: number,
	reliefFrequency: number,
	reliefOctaves: number,
	reliefAmplitude: number,
	warpAmplitude: number,
	warpFrequency: number,
): Float64Array {
	const height = new Float64Array(grid.count);
	const continentSeed = (seed + CONTINENT_SEED_OFFSET) | 0;
	const reliefSeed = (seed + RELIEF_SEED_OFFSET) | 0;
	const warpSeed = (seed + WARP_SEED_OFFSET) | 0;
	for (let cell = 0; cell < grid.count; cell++) {
		const x = grid.directions[cell * 3]!;
		const y = grid.directions[cell * 3 + 1]!;
		const z = grid.directions[cell * 3 + 2]!;
		const wx = x + warpAmplitude * fbm(x, y, z, warpFrequency, 3, warpSeed);
		const wy =
			y + warpAmplitude * fbm(x, y, z, warpFrequency, 3, warpSeed + 1);
		const wz =
			z + warpAmplitude * fbm(x, y, z, warpFrequency, 3, warpSeed + 2);
		height[cell] =
			fbm(
				wx,
				wy,
				wz,
				continentFrequency,
				continentOctaves,
				continentSeed,
			) +
			reliefAmplitude *
				fbm(x, y, z, reliefFrequency, reliefOctaves, reliefSeed);
	}
	return height;
}
