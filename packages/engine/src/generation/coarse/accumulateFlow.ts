import type { CoarseGrid } from "./CoarseGrid.js";
import { downhillOrder } from "./downhillOrder.js";

/**
 * How many cells drain through each one, counting itself.
 *
 * Every cell contributes 1 and passes its running total downstream. Adding in
 * order of descending surface height means a cell is only ever added to after
 * everything above it has been, so one pass over the ordering is enough.
 *
 * The number is a cell count rather than an area. Cell areas vary about 2:1
 * across the sphere, so this is a proxy for catchment size, and it is what
 * decides which channels are drawn as rivers.
 */
export function accumulateFlow(
	grid: CoarseGrid,
	surface: Float64Array,
	down: Int32Array,
	seaLevel: number,
): Float64Array {
	const flow = new Float64Array(grid.count);
	const order = downhillOrder(grid, surface, seaLevel);
	for (const cell of order) flow[cell] = 1;
	for (const cell of order) {
		const next = down[cell]!;
		if (next >= 0) flow[next] = flow[next]! + flow[cell]!;
	}
	return flow;
}
