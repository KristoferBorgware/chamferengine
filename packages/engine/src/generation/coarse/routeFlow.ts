import type { CoarseGrid } from "./CoarseGrid.js";

/**
 * Where each cell drains to, as the index of its lowest neighbour, or `-1` for
 * a cell that drains nowhere.
 *
 * A cell at or below sea level is an outlet and drains nowhere. Above it, a
 * cell run through {@link fillPits} always has a lower neighbour, so `-1` on
 * land means the fill was skipped.
 *
 * A pentagon picks the lowest of five instead of six, and that is the entire
 * difference: routing compares a cell against its own neighbours and never
 * asks how many there are or which face they came from.
 */
export function routeFlow(
	grid: CoarseGrid,
	surface: Float64Array,
	seaLevel: number,
): Int32Array {
	const down = new Int32Array(grid.count).fill(-1);
	for (let cell = 0; cell < grid.count; cell++) {
		if (surface[cell]! <= seaLevel) continue;
		let best = -1;
		let lowest = surface[cell]!;
		const base = cell * 6;
		for (let k = 0; k < 6; k++) {
			const next = grid.ring[base + k]!;
			if (next < 0) continue;
			if (surface[next]! < lowest) {
				lowest = surface[next]!;
				best = next;
			}
		}
		down[cell] = best;
	}
	return down;
}
