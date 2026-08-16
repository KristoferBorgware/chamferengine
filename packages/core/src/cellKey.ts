import { FACES } from "./icosahedron.js";
import { latticeWeights } from "./latticeWeights.js";

/**
 * A cell's identity, independent of which face names it.
 *
 * Up to six face-and-`(i, j)` pairs describe one cell on a shared edge or
 * corner. Dropping the zero weights and sorting by global vertex number gives
 * one string for all of them, so two addresses can be compared without first
 * deciding which face owns the cell.
 */
export function cellKey(face: number, n: number, i: number, j: number): string {
	const w = latticeWeights(n, i, j);
	const ids = FACES[face]!;
	return ids
		.map((v, x) => [v, w[x]!] as const)
		.filter(([, weight]) => weight > 0)
		.sort((p, q) => p[0] - q[0])
		.map(([v, weight]) => `${v}:${weight}`)
		.join("|");
}
