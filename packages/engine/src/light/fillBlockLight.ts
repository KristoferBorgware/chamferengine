import type { BlockLightChart, SolidAt } from "./BlockLightChart.js";
import { DIRECTIONS } from "../addressing/index.js";

/**
 * A cell's eight neighbours as chart offsets: the six lateral steps, then down
 * a layer and up one.
 *
 * A layer is a radial index counting downward from the crust top, and the
 * tessellation is identical at every layer, so a column of cells is a straight
 * line sharing one `(i, j)` and the radial axis never branches. That is what
 * makes the vertical pair two offsets rather than a second lookup.
 */
const STEPS: readonly (readonly [number, number, number])[] = [
	...DIRECTIONS.map(([di, dj]) => [di, dj, 0] as const),
	[0, 0, 1],
	[0, 0, -1],
];

/**
 * Flood a light out from one cell, losing a step of brightness per neighbour
 * and stopping at anything solid.
 *
 * The fill runs breadth first over the chart's own coordinates, so a step is
 * two additions and the cell it lands on is looked up only to ask whether it
 * is solid. A hexagonal disc of radius `r` holds `3r^2 + 3r + 1` cells against
 * a square grid's `2r^2 + 2r + 1`, so the work is half again a cube world's at
 * every range and grows as the cube of the range in three dimensions -- the
 * range is the one lever over what this costs.
 *
 * **A solid cell takes a level and does not pass it on.** Light stops at rock,
 * and the level written into the rock is what the face standing on it reads:
 * a shader samples half a block out along a face's own normal, into the air
 * the light actually crossed, and the value left in the rock keeps a filtered
 * read from darkening every wall it touches.
 *
 * The twelve pentagons need no case. A ring around one holds `5k` cells where
 * a hexagon's holds `6k`, so a light there reaches five sixths as many cells
 * at the same brightness -- there is less world within reach, and nothing is
 * dimmer.
 */
export function fillBlockLight(
	face: number,
	i: number,
	j: number,
	layer: number,
	range: number,
	side: number,
	solid: SolidAt,
): BlockLightChart {
	const levels: Uint8Array<ArrayBuffer> = new Uint8Array(side * side * side);
	const half = (side - 1) / 2;
	const at = (di: number, dj: number, dl: number): number =>
		(dl + half) * side * side + (dj + half) * side + (di + half);
	const chart: BlockLightChart = { face, i, j, layer, range, side, levels };
	if (range < 1) return chart;

	// Steps left rather than a fraction, so the comparison that keeps a cell
	// from being walked twice is on whole numbers. The source holds one more
	// than the range, which is what leaves a cell `range` steps out with the
	// dimmest level there is rather than with nothing: the lit disc in one
	// layer is then exactly `3r^2 + 3r + 1`.
	const full = range + 1;
	const steps = new Int16Array(levels.length).fill(-1);
	const write = (index: number, left: number): void => {
		steps[index] = left;
		levels[index] = Math.round((255 * left) / full);
	};

	let front: number[] = [0, 0, 0];
	write(at(0, 0, 0), full);
	for (let left = full; left > 1 && front.length > 0; left--) {
		const next: number[] = [];
		for (let n = 0; n < front.length; n += 3) {
			const di = front[n]!;
			const dj = front[n + 1]!;
			const dl = front[n + 2]!;
			for (const [si, sj, sl] of STEPS) {
				const ti = di + si;
				const tj = dj + sj;
				const tl = dl + sl;
				if (
					ti < -half ||
					ti > half ||
					tj < -half ||
					tj > half ||
					tl < -half ||
					tl > half
				)
					continue;
				const index = at(ti, tj, tl);
				if (steps[index]! >= left - 1) continue;
				write(index, left - 1);
				if (solid(face, i + ti, j + tj, layer + tl)) continue;
				next.push(ti, tj, tl);
			}
		}
		front = next;
	}
	return chart;
}
