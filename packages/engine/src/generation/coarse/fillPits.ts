import type { CoarseGrid } from "./CoarseGrid.js";
import { MinHeap } from "./MinHeap.js";

/**
 * How much each filled cell is lifted above the one that flooded it.
 *
 * Filling a basin to a flat level leaves no cell in it with a lower neighbour,
 * so every river stops dead at the first lake it reaches. Lifting each cell a
 * fraction above the one the water arrived from gives the lake surface a slope
 * far too small to see and a direction to drain in, which takes the count of
 * dead ends to zero.
 *
 * The size is set by where the result is stored. Heights run to about 1.5, and
 * `float32` steps by `1.2e-7` there, so a lift near that size lands back on the
 * value it was lifted from and the lake is flat again. This is roughly 80 of
 * those steps, and `1e-5` of a height range that spans a crust of a few hundred
 * metres is under a millimetre of tilt across a lake.
 */
const FILL_SLOPE = 1e-5;

/**
 * The surface water stands on: the terrain, raised wherever a basin has to
 * flood before it can drain.
 *
 * The ocean grows inward. Every cell at or below sea level starts flooded, and
 * the queue repeatedly takes the lowest flooded cell and floods its neighbours,
 * lifting any that sit below it. A cell reached this way is reached at the
 * lowest level water can arrive at it from the sea, which is by definition the
 * level its basin fills to.
 *
 * The terrain itself is not modified. A cell where the result stands above the
 * terrain is under a lake, and how far above is how deep.
 */
export function fillPits(
	grid: CoarseGrid,
	height: Float64Array,
	seaLevel: number,
): Float64Array {
	const filled = Float64Array.from(height);
	const flooded = new Uint8Array(grid.count);
	const queue = new MinHeap(grid.count);

	for (let cell = 0; cell < grid.count; cell++)
		if (height[cell]! <= seaLevel) {
			flooded[cell] = 1;
			queue.push(height[cell]!, cell);
		}

	while (queue.size > 0) {
		const cell = queue.pop();
		const level = filled[cell]!;
		const base = cell * 6;
		for (let k = 0; k < 6; k++) {
			const next = grid.ring[base + k]!;
			if (next < 0 || flooded[next]) continue;
			flooded[next] = 1;
			if (filled[next]! <= level) filled[next] = level + FILL_SLOPE;
			queue.push(filled[next]!, next);
		}
	}
	return filled;
}
