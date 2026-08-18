import type { CoarseGrid } from "./CoarseGrid.js";

/**
 * How steeply the ground falls away at each cell, as metres per metre.
 *
 * Taken over the grid's own ring, so it crosses the twenty faces the way every
 * other neighbour query does. Reading a slope from offsets inside one face
 * would break at the thirty face edges, and material picked from slope would
 * draw that break as a visible line.
 *
 * **Rise over run, and both are metres**, so it is the number a person means by
 * a slope and it holds still whatever the map's level is. The largest drop to a
 * neighbour on its own does not: a cell step halves at every finer level, so
 * the same ground read `0.047`, `0.025` and `0.012` at levels 6, 7 and 8, and
 * anything with a fixed idea of what counts as steep -- a color ramp, a
 * material rule, a spawn test -- read a different planet at every map size.
 */
export function coarseSlope(
	grid: CoarseGrid,
	height: Float64Array,
	cellMetres: number,
): Float32Array {
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
		slope[cell] = worst / cellMetres;
	}
	return slope;
}
