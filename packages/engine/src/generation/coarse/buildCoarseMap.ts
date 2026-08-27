import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import { COARSE_MAP_DEFAULTS } from "./CoarseMapOptions.js";
import { CoarseGrid } from "./CoarseGrid.js";
import { CoarseMap } from "./CoarseMap.js";
import { layeredHeight } from "./layeredHeight.js";

/**
 * Compute a planet's coarse map from its seed.
 *
 * Three noise layers and their curves, and that is the whole of it. The ground
 * comes out in metres rather than being fitted to a percentile afterwards,
 * because the continentalness curve's middle is the waterline.
 *
 * Seconds of work, once, at world creation. Nothing here runs per frame, and
 * nothing runs afterwards either: what this returns **is** the terrain.
 */
export function buildCoarseMap(
	seed: number,
	options: CoarseMapOptions = {},
): CoarseMap {
	const settings = { ...COARSE_MAP_DEFAULTS, ...options };
	const grid = new CoarseGrid(settings.level);
	return new CoarseMap(
		seed,
		grid,
		Float32Array.from(layeredHeight(grid, seed, settings).raw),
	);
}
