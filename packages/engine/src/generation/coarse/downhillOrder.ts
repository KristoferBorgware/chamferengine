import type { CoarseGrid } from "./CoarseGrid.js";

/** Every land cell, highest first. */
export function downhillOrder(
	grid: CoarseGrid,
	surface: Float64Array,
	seaLevel: number,
): Int32Array {
	let land = 0;
	for (let cell = 0; cell < grid.count; cell++)
		if (surface[cell]! > seaLevel) land++;
	const order = new Int32Array(land);
	let at = 0;
	for (let cell = 0; cell < grid.count; cell++)
		if (surface[cell]! > seaLevel) order[at++] = cell;
	// Sorting on the surface alone leaves ties in whatever order the sort
	// chooses. Falling back to the index makes the ordering a function of the
	// heights and nothing else.
	const sorted = Array.from(order).sort((a, b) => {
		const d = surface[b]! - surface[a]!;
		return d !== 0 ? d : a - b;
	});
	return Int32Array.from(sorted);
}
