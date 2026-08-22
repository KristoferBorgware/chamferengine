import type { CoarseGrid } from "./CoarseGrid.js";
import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import { COARSE_MAP_DEFAULTS } from "./CoarseMapOptions.js";
import {
	MOUNTAIN_SEED_OFFSET,
	TERRAIN_SEED_OFFSET,
	layerNoiseSettings,
	radiusOf,
} from "./layeredHeight.js";
import { octaveNoise } from "../noise/octaveNoise.js";

/** Each layer's octave stack, read at every cell, before any curve touches it. */
export interface LayerNoise {
	readonly terrain: Float64Array;

	/** Nothing when the mountain layer is off, because then it is never read. */
	readonly mountain: Float64Array | null;
}

/**
 * The two layers' noise over the whole map, with no curve applied.
 *
 * **A curve is not a field.** The octave stacks answer to the seed, the layer
 * widths and the octave counts; the curves, the merge, the line and the balance
 * are read *from* those numbers afterwards. Splitting the two lets a caller
 * that is dragging a curve keep the field it already has -- measured on the
 * shipped level-8 map in the browser, the stacks are `410 ms` of an `840 ms`
 * rebuild, so the drag that changes no noise at all was paying half its cost
 * for it.
 *
 * The cost of holding it is two `float64` fields, `10.5 MB` at level 8, against
 * the grid's own 31 MB of directions and rings that are already resident.
 * `float64` and not `float32`: the value is what a spline is evaluated at, and
 * a rounded one is a different world.
 */
export function layerNoise(
	grid: CoarseGrid,
	seed: number,
	options: CoarseMapOptions = {},
): LayerNoise {
	const s = { ...COARSE_MAP_DEFAULTS, ...options };
	const radius = radiusOf(s.cellMetres, s.level);
	const terrain = layerNoiseSettings(s.terrain, radius);
	const mountain = layerNoiseSettings(s.mountain, radius);
	const terrainSeed = (seed + TERRAIN_SEED_OFFSET) | 0;
	const mountainSeed = (seed + MOUNTAIN_SEED_OFFSET) | 0;

	const terrainOf = new Float64Array(grid.count);
	const mountainOf = s.mountainLayer ? new Float64Array(grid.count) : null;
	for (let cell = 0; cell < grid.count; cell++) {
		const x = grid.directions[cell * 3]!;
		const y = grid.directions[cell * 3 + 1]!;
		const z = grid.directions[cell * 3 + 2]!;
		terrainOf[cell] = octaveNoise(x, y, z, terrainSeed, terrain);
		if (mountainOf)
			mountainOf[cell] = octaveNoise(x, y, z, mountainSeed, mountain);
	}
	return { terrain: terrainOf, mountain: mountainOf };
}
