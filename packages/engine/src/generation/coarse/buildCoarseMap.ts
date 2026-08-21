import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import { COARSE_MAP_DEFAULTS } from "./CoarseMapOptions.js";
import { CoarseGrid } from "./CoarseGrid.js";
import { CoarseMap } from "./CoarseMap.js";
import { erodeDroplets } from "./erodeDroplets.js";
import { layeredHeight } from "./layeredHeight.js";
import { metreHeight } from "./metreHeight.js";

/**
 * Compute a planet's coarse map from its seed.
 *
 * Three steps, and the order is fixed by what each needs from the one before
 * it. Two noise layers and their curves decide the shape, sea level and the
 * metre scale turn that shape into ground a person can measure, and water cuts
 * into the ground.
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
	const { raw, mountain } = layeredHeight(grid, seed, settings);
	const height = metreHeight(raw, mountain, settings);
	erodeDroplets(grid, height, seed, settings.erosion, settings.cellMetres);
	return new CoarseMap(seed, grid, Float32Array.from(height));
}
