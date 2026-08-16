/**
 * How many cells lie within `range` steps of one of the twelve pentagons.
 *
 * `1 + 5r(r + 1)/2`, which is five sixths of a hexagon's reach: a ring around a
 * pentagon holds `5k` cells where a hexagon's holds `6k`. A torch at a pentagon
 * is not dimmer, there is simply less world within reach of it.
 */
export function pentagonDiscCells(range: number): number {
	return 1 + (5 * range * (range + 1)) / 2;
}
