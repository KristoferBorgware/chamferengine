import { neighbour } from "./neighbour.js";

/**
 * How many neighbours a lattice point has: 5 on the twelve pentagons, 6
 * everywhere else.
 */
export function degree(face: number, n: number, i: number, j: number): number {
	let count = 0;
	for (let k = 0; k < 6; k++)
		if (neighbour(face, n, i, j, k) !== null) count++;
	return count;
}
