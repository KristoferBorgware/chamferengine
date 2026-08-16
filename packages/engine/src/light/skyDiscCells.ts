/**
 * How many cells lie within `range` steps of a hexagon, counting itself.
 *
 * `3r^2 + 3r + 1`. A square grid reaches `2r^2 + 2r + 1` over the same number
 * of steps, so a light source on this grid touches half again as many cells at
 * every range, and the work grows as the cube of the range in three dimensions.
 */
export function skyDiscCells(range: number): number {
	return 3 * range * range + 3 * range + 1;
}
