import type { CoarseGrid } from "./CoarseGrid.js";
import { fbm } from "../noise/fbm.js";

/**
 * The seeds the two tiers are drawn with, offset from the world seed.
 *
 * The hash mixes the seed through a multiply, so neighbouring seeds produce
 * unrelated fields and the two tiers do not share features.
 */
const CONTINENT_SEED_OFFSET = 0;
const RELIEF_SEED_OFFSET = 1;

/**
 * The raw surface, before any water is routed across it.
 *
 * Two tiers of noise summed. The continent tier runs at a low frequency and
 * decides where the land is; the relief tier runs high and roughens it. Both
 * are sampled from the cell's direction in 3D, never from its offset inside a
 * face, so nothing about the twenty faces appears in the result.
 *
 * The two tiers are separate rather than octaves of one field because they
 * answer different questions and are tuned against different measurements: the
 * continent tier against how long a river gets, the relief tier against how
 * rough a hillside looks.
 */
export function continentHeight(
	grid: CoarseGrid,
	seed: number,
	continentFrequency: number,
	continentOctaves: number,
	reliefFrequency: number,
	reliefOctaves: number,
	reliefAmplitude: number,
): Float64Array {
	const height = new Float64Array(grid.count);
	const continentSeed = (seed + CONTINENT_SEED_OFFSET) | 0;
	const reliefSeed = (seed + RELIEF_SEED_OFFSET) | 0;
	for (let cell = 0; cell < grid.count; cell++) {
		const x = grid.directions[cell * 3]!;
		const y = grid.directions[cell * 3 + 1]!;
		const z = grid.directions[cell * 3 + 2]!;
		height[cell] =
			fbm(x, y, z, continentFrequency, continentOctaves, continentSeed) +
			reliefAmplitude *
				fbm(x, y, z, reliefFrequency, reliefOctaves, reliefSeed);
	}
	return height;
}
