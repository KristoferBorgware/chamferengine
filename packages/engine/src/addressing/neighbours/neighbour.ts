import type { FaceCell } from "./FaceCell.js";
import { DIRECTIONS } from "./DIRECTIONS.js";
import { acrossEdge } from "./acrossEdge.js";
import { latticeWeights } from "../lattice/latticeWeights.js";
import { pentagonRing } from "./pentagonRing.js";
import { pentagonVertex } from "./pentagonVertex.js";

/**
 * The neighbour of `(face, i, j)` in direction `k`, at subdivision `n`.
 *
 * Returns `null` only for `k = 5` on one of the twelve pentagons, whose ring is
 * five long. That is a direction which does not exist rather than a gap: the
 * ring is short, never holed and never doubled.
 *
 * Away from those twelve, stepping off the face is a reflection and the whole
 * of it is three additions. A lattice point is integer weights on global vertex
 * numbers; step outside and exactly one weight goes negative. Reflecting across
 * the shared edge sends `(alpha, beta, gamma)` to
 * `(alpha + gamma, beta + gamma, -gamma)`, where `gamma` is the negative one.
 * The point itself does not move — only the name it is written under. The table
 * is consulted for one thing: which face is over there.
 */
export function neighbour(
	face: number,
	n: number,
	i: number,
	j: number,
	k: number,
): FaceCell | null {
	const p = pentagonVertex(face, n, i, j);
	if (p >= 0) return pentagonRing(p, n, face)[k] ?? null;

	const [di, dj] = DIRECTIONS[k]!;
	const ni = i + di;
	const nj = j + dj;
	const w = latticeWeights(n, ni, nj);

	let negative = -1;
	for (let x = 0; x < 3; x++) if (w[x]! < 0) negative = x;
	if (negative < 0) return { face, i: ni, j: nj };

	// The edge opposite the vertex whose weight went negative is the one
	// crossed, and the reflection over it is the whole of the step.
	return acrossEdge(face, w, negative);
}
