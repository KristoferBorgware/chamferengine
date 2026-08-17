import type { CoarseGrid } from "./CoarseGrid.js";
import { downhillOrder } from "./downhillOrder.js";

/**
 * How many cells drain through each one, counting itself.
 *
 * Every cell contributes 1 and passes its running total downstream. Adding in
 * order of descending surface height means a cell is only ever added to after
 * everything above it has been, so one pass over the ordering is enough.
 *
 * The number is a cell count, which is a fact about the graph and holds at any
 * radius. It is not a catchment: a cell is four times smaller at each finer
 * level, so the same ground scores four times higher. Anything comparing one
 * channel against another across resolutions multiplies by the area a cell
 * covers first, which {@link TerrainGenerator} does.
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
