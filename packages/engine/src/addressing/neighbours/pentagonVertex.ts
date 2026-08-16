import { FACES } from "../solid/icosahedron.js";
import { latticeWeights } from "../lattice/latticeWeights.js";

/**
 * The icosahedron vertex a cell sits on, or `-1` when it sits on none.
 *
 * A cell is a vertex when two of its three weights are zero, which puts all of
 * its weight on one corner. Those twelve cells are the pentagons.
 */
export function pentagonVertex(
	face: number,
	n: number,
	i: number,
	j: number,
): number {
	const w = latticeWeights(n, i, j);
	let full = -1;
	let zeros = 0;
	for (let x = 0; x < 3; x++) {
		if (w[x] === 0) zeros++;
		else full = x;
	}
	return zeros === 2 ? FACES[face]![full]! : -1;
}
