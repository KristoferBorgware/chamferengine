import type { CoarseGrid } from "./CoarseGrid.js";
import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import { COARSE_MAP_DEFAULTS } from "./CoarseMapOptions.js";
import {
	CONTINENT_SEED_OFFSET,
	EROSION_SEED_OFFSET,
	PEAKS_SEED_OFFSET,
	layerNoiseSettings,
	radiusOf,
} from "./layeredHeight.js";
import { octaveNoise } from "../noise/octaveNoise.js";

/** Each layer's octave stack, read at every cell, before any curve touches it. */
export interface LayerNoise {
	readonly continent: Float64Array;
	readonly erosion: Float64Array;
	readonly peaks: Float64Array;
}

/**
 * The three layers' noise over the whole map, with no curve applied.
 *
 * **A curve is not a field.** The octave stacks answer to the seed, the layer
 * widths, the octave counts, the falloffs and the folds; the curves and every
 * metre knob are read *from* those numbers afterwards. Splitting the two lets a
 * caller that is dragging a curve keep the field it already has -- measured on
 * the shipped level-8 map in the browser, the stacks are the larger half of a
 * rebuild, so the drag that changes no noise at all was paying for it.
 *
 * The cost of holding it is three `float64` fields, `15.7 MB` at level 8,
 * against the grid's own 31 MB of directions and rings that are already
 * resident. `float64` and not `float32`: the value is what a spline is
 * evaluated at, and a rounded one is a different world.
 *
 * **A layer that is off is still read.** Its switch says what the height does
 * with it, not whether the field exists -- the panel draws every layer's
 * picture and histogram whether or not the world is reading it, because what a
 * switched-off layer *would* put back is the thing being decided.
 */
export function layerNoise(
	grid: CoarseGrid,
	seed: number,
	options: CoarseMapOptions = {},
): LayerNoise {
	const s = { ...COARSE_MAP_DEFAULTS, ...options };
	const radius = radiusOf(s.cellMetres, s.level);
	const continent = layerNoiseSettings(s.continent, radius);
	const erosion = layerNoiseSettings(s.erosion, radius);
	const peaks = layerNoiseSettings(s.peaks, radius);
	const continentSeed = (seed + CONTINENT_SEED_OFFSET) | 0;
	const erosionSeed = (seed + EROSION_SEED_OFFSET) | 0;
	const peaksSeed = (seed + PEAKS_SEED_OFFSET) | 0;

	const continentOf = new Float64Array(grid.count);
	const erosionOf = new Float64Array(grid.count);
	const peaksOf = new Float64Array(grid.count);
	for (let cell = 0; cell < grid.count; cell++) {
		const x = grid.directions[cell * 3]!;
		const y = grid.directions[cell * 3 + 1]!;
		const z = grid.directions[cell * 3 + 2]!;
		continentOf[cell] = octaveNoise(x, y, z, continentSeed, continent);
		erosionOf[cell] = octaveNoise(x, y, z, erosionSeed, erosion);
		peaksOf[cell] = octaveNoise(x, y, z, peaksSeed, peaks);
	}
	return { continent: continentOf, erosion: erosionOf, peaks: peaksOf };
}
