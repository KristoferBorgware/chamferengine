import type { CoarseGrid } from "./CoarseGrid.js";
import { CELL_CONSTANT } from "../../world/CELL_CONSTANT.js";

/**
 * How steeply the ground falls away at each cell, as rise over run.
 *
 * Taken over the grid's own ring, so it crosses the twenty faces the way every
 * other neighbour query does. Reading a slope from offsets inside one face
 * would break at the thirty face edges, and material picked from slope would
 * draw that break as a visible line.
 *
 * **The run is divided out, so the number does not depend on the map's
 * level.** The largest drop to a neighbour is a drop per cell step, and a cell
 * step halves at every finer level: the same ground measured `0.047` at level
 * 6, `0.025` at level 7 and `0.012` at level 8, so anything with a fixed idea
 * of what counts as steep -- a color ramp, a material rule, a spawn test --
 * reads a different planet at every map size. Dividing by the step in units of
 * the planet radius, `CELL_CONSTANT / 2^level`, leaves a gradient that holds
 * still.
 *
 * The units are height units per radius unit. A consumer multiplies by
 * `heightScale / radius` to get a true rise over run in metres.
 */
export function coarseSlope(
	grid: CoarseGrid,
	height: Float64Array,
): Float32Array {
	const step = CELL_CONSTANT / 2 ** grid.level;
	const slope = new Float32Array(grid.count);
	for (let cell = 0; cell < grid.count; cell++) {
		let worst = 0;
		const base = cell * 6;
		for (let k = 0; k < 6; k++) {
			const next = grid.ring[base + k]!;
			if (next < 0) continue;
			const drop = Math.abs(height[cell]! - height[next]!);
			if (drop > worst) worst = drop;
		}
		slope[cell] = worst / step;
	}
	return slope;
}
