import type { FaceCell } from "./FaceCell.js";
import { FACES } from "../solid/icosahedron.js";
import { FACE_ADJACENCY } from "../solid/faceAdjacency.js";

/**
 * Move a set of weights across the edge opposite vertex `leaving`.
 *
 * A point on a face is three weights on that face's three **global** vertex
 * numbers, and that description never mentions a face. Sending
 * `(alpha, beta, gamma)` to `(alpha + gamma, beta + gamma, -gamma)` -- `gamma`
 * being the weight on the vertex left behind, and the third vertex the one the
 * face over the edge carries instead -- writes the same point under the other
 * face's name. The table is consulted for one thing: which face is over there.
 *
 * **The weights need not be whole.** A lattice point one step off a face
 * carries a `gamma` of `-1` and comes back as that face's own neighbour. A
 * point standing between cells carries the fractions between them, and at a
 * `gamma` of zero -- a point exactly on the edge -- nothing moves at all. The
 * map is linear, so it carries a **direction** as readily as a position: hand
 * it the three components of a step and it hands back that step continuing onto
 * the other face.
 */
export function acrossEdge(
	face: number,
	weights: readonly [number, number, number],
	leaving: number,
): FaceCell {
	const here = FACES[face]!;
	const link = FACE_ADJACENCY[face]![(leaving + 1) % 3]!;
	const gamma = weights[leaving]!;
	const u = here[(leaving + 1) % 3]!;
	const v = here[(leaving + 2) % 3]!;
	const there = FACES[link.face]!;
	const carried = new Map([
		[u, weights[((leaving + 1) % 3) as 0 | 1 | 2] + gamma],
		[v, weights[((leaving + 2) % 3) as 0 | 1 | 2] + gamma],
		[there.find((x) => x !== u && x !== v)!, -gamma],
	]);
	return {
		face: link.face,
		i: carried.get(there[1]!) ?? 0,
		j: carried.get(there[2]!) ?? 0,
	};
}
