import type { CoarseGrid } from "./CoarseGrid.js";
import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import type { NoiseSettings } from "../noise/NoiseSettings.js";
import { COARSE_MAP_DEFAULTS } from "./CoarseMapOptions.js";
import { octaveNoise } from "../noise/octaveNoise.js";

/** Offset from the noise seed, so the push is not the field it pushes. */
const WARP_SEED_OFFSET = 11;

/**
 * The field that pushes the sample point, when the warp is turned up.
 *
 * Three octaves of value noise, whatever basis the surface itself uses. A warp
 * has to be smooth: it displaces the point a field is read at, so a step
 * anywhere in it tears the field into two pieces that do not meet. Cellular
 * noise has a crease along every plate boundary, which is exactly such a step.
 *
 * It does not read the surface's own octave settings either. Pushing a field
 * by a copy of itself folds it along its own features and leaves the coast
 * where it was.
 */
const WARP_OCTAVES = 3;

/**
 * The surface as one field of octave noise, sampled from each cell's own
 * direction in 3D.
 *
 * Sampled in 3D world space and never from a face's own `(i, j)`, which is
 * what makes the thirty face edges invisible: a cell on an edge has two names
 * and one direction, so both names give it the same height.
 *
 * **Warping is a knob, not a mode.** At an amplitude of zero the sample point
 * is read where it stands and this is the plain field. Above zero a second,
 * smooth field displaces the point first, which folds the coastline without
 * changing what is being cut: the same continents, in the same places, with an
 * edge that wanders. The two are one code path because the difference between
 * them is one number.
 *
 * The result is in `[-1, 1]` and carries no unit. The metre scale downstream
 * puts sea level at the percentile that leaves the asked-for land above it and
 * scales what is left into metres.
 */
export function surfaceHeight(
	grid: CoarseGrid,
	seed: number,
	options: CoarseMapOptions = {},
): Float64Array {
	const s = { ...COARSE_MAP_DEFAULTS, ...options };

	// One settings object for the whole build. The spin is turned into a sine
	// and a cosine here, once, so no sample computes one.
	const settings: NoiseSettings = {
		basis: s.basis,
		frequency: s.frequency,
		octaves: s.octaves,
		persistence: s.persistence,
		lacunarity: s.lacunarity,
		offsetX: s.offsetX,
		offsetY: s.offsetY,
		ridge: s.ridge,
		jitter: s.jitter,
		feature: s.feature,
		spinSin: Math.sin(s.spin),
		spinCos: Math.cos(s.spin),
	};
	const warp: NoiseSettings = {
		...settings,
		basis: "value",
		frequency: s.warpFrequency,
		octaves: WARP_OCTAVES,
		persistence: 0.5,
		lacunarity: 2,
		offsetX: 0,
		offsetY: 0,
		ridge: 0,
	};

	const height = new Float64Array(grid.count);
	const warpSeed = (seed + WARP_SEED_OFFSET) | 0;
	const amplitude = s.warpAmplitude;
	for (let cell = 0; cell < grid.count; cell++) {
		const x = grid.directions[cell * 3]!;
		const y = grid.directions[cell * 3 + 1]!;
		const z = grid.directions[cell * 3 + 2]!;
		if (amplitude === 0) {
			height[cell] = octaveNoise(x, y, z, seed, settings);
			continue;
		}
		height[cell] = octaveNoise(
			x + amplitude * octaveNoise(x, y, z, warpSeed, warp),
			y + amplitude * octaveNoise(x, y, z, warpSeed + 1, warp),
			z + amplitude * octaveNoise(x, y, z, warpSeed + 2, warp),
			seed,
			settings,
		);
	}
	return height;
}
