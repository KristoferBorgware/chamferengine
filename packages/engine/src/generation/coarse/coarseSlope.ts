import type { CoarseGrid } from "./CoarseGrid.js";

/**
 * How steeply the ground falls away at each cell, as the largest height
 * difference to any neighbour.
 *
 * Taken over the grid's own ring, so it crosses the twenty faces the way every
 * other neighbour query does. Reading a slope from offsets inside one face
 * would break at the thirty face edges, and material picked from slope would
 * draw that break as a visible line.
 *
 * The units are height units per cell step. A consumer scales by its own metres
 * per unit and metres per cell to get a gradient.
 */
export function coarseSlope(
	grid: CoarseGrid,
	height: Float64Array,
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
		slope[cell] = worst;
	}
	return slope;
}
