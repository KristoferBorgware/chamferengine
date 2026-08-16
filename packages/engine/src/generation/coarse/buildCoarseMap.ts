import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import { COARSE_MAP_DEFAULTS } from "./CoarseMapOptions.js";
import { CoarseGrid } from "./CoarseGrid.js";
import { CoarseMap } from "./CoarseMap.js";
import { accumulateFlow } from "./accumulateFlow.js";
import { coarseSlope } from "./coarseSlope.js";
import { continentHeight } from "./continentHeight.js";
import { erode } from "./erode.js";
import { fillPits } from "./fillPits.js";
import { routeFlow } from "./routeFlow.js";
import { seaLevelFor } from "./seaLevelFor.js";

/**
 * Compute a planet's coarse map from its seed.
 *
 * The order is fixed by what each step needs from the one before it.
 * Continents come first because a river cannot be longer than the land it
 * crosses, so the continent tier decides the scale of everything downstream of
 * it. Sea level follows, because routing needs to know which cells are
 * outlets. Erosion cuts the channels, and the final flood and route describe
 * the surface erosion left behind.
 *
 * Seconds of work, once, at world creation. Nothing here runs per frame.
 */
export function buildCoarseMap(
	seed: number,
	options: CoarseMapOptions = {},
): CoarseMap {
	const settings = { ...COARSE_MAP_DEFAULTS, ...options };
	const grid = new CoarseGrid(settings.level);

	const height = continentHeight(
		grid,
		seed,
		settings.continentFrequency,
		settings.continentOctaves,
		settings.reliefFrequency,
		settings.reliefOctaves,
		settings.reliefAmplitude,
	);
	const seaLevel = seaLevelFor(height, settings.landFraction);

	erode(grid, height, seaLevel, settings.erosionPasses, settings.erosionRate);

	const filled = fillPits(grid, height, seaLevel);
	const down = routeFlow(grid, filled, seaLevel);
	const flow = accumulateFlow(grid, filled, down, seaLevel);

	// The ocean stands at sea level rather than on the seabed, so a single
	// field answers "how high is the water here" over ocean, lake and dry land
	// alike.
	const water = new Float32Array(grid.count);
	for (let cell = 0; cell < grid.count; cell++)
		water[cell] = Math.max(filled[cell]!, seaLevel);

	return new CoarseMap(
		seed,
		grid,
		seaLevel,
		Float32Array.from(height),
		water,
		Float32Array.from(flow),
		coarseSlope(grid, height),
	);
}
