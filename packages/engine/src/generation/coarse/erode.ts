import type { CoarseGrid } from "./CoarseGrid.js";
import { accumulateFlow } from "./accumulateFlow.js";
import { fillPits } from "./fillPits.js";
import { routeFlow } from "./routeFlow.js";

/**
 * How much of the drop to its neighbour a cell may lose in one round.
 *
 * Cutting a cell below the one it drains into turns it into a new pit, which
 * the next round has to flood back. Stopping at half the drop leaves the
 * channel pointing the same way it did before the cut.
 */
const MAX_INCISION_SHARE = 0.5;

/**
 * Cut channels into the surface, in place.
 *
 * Each round floods the basins, routes every cell downhill, counts what drains
 * through it, and lowers it by `rate * sqrt(flow) * slope`. A cell with a large
 * catchment on a steep slope cuts deepest, which is what turns an even
 * hillside into a branching network.
 *
 * The exponents are `0.5` on the drainage area and `1` on the slope, and they
 * are written as `Math.sqrt` and a plain multiply. `Math.pow` is a library
 * routine whose last bit moves between runtimes, while `sqrt` is an IEEE 754
 * operation that gives the same bits everywhere, so the exponents available
 * here are the ones reachable as products of square roots.
 */
export function erode(
	grid: CoarseGrid,
	height: Float64Array,
	seaLevel: number,
	passes: number,
	rate: number,
): void {
	for (let pass = 0; pass < passes; pass++) {
		const filled = fillPits(grid, height, seaLevel);
		const down = routeFlow(grid, filled, seaLevel);
		const flow = accumulateFlow(grid, filled, down, seaLevel);
		for (let cell = 0; cell < grid.count; cell++) {
			const next = down[cell]!;
			if (next < 0) continue;
			const drop = filled[cell]! - filled[next]!;
			if (drop <= 0) continue;
			const incision = rate * Math.sqrt(flow[cell]!) * drop;
			height[cell] =
				height[cell]! - Math.min(incision, drop * MAX_INCISION_SHARE);
		}
	}
}
