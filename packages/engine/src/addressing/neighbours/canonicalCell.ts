import type { FaceCell } from "./FaceCell.js";
import { cellRepresentations } from "./cellRepresentations.js";

/**
 * The one representation an ID is built from.
 *
 * The face number is the most significant field below the planet, so the
 * lowest face gives the lowest packed value. That is the same rule that awards
 * a border cell to the lowest chunk containing it, applied one level up.
 *
 * **A cell has a second name only on a face edge, and that is three
 * comparisons rather than a search.** A lattice point's weights are
 * `(n - i - j, i, j)`, and a weight of zero is what puts the point on the edge
 * opposite that vertex; two zeros put it on an icosahedron vertex, where five
 * faces meet. With no zero the point is strictly inside its own face, which
 * names it and nothing else does.
 *
 * The share that needs the search shrinks with depth: a face holds
 * `(n+1)(n+2)/2` lattice points and `3n` of them sit on an edge, so it is
 * `2.32%` at level 8 and `0.29%` at level 11. Without the guard every other
 * call walks all twenty faces building a map and an array to hand back the
 * cell it was given, and this is on the path of `encodeCell`, `cellSlot`,
 * `owns` and every ring the mesher and the delta store walk. Measured over
 * 1.08 million ring steps at level 8, `1,207 ms` against `70 ms` — and
 * `neighbour` itself is `52 ms` of that, so the canonicalising was not a cost
 * beside the walk, it was the walk.
 */
export function canonicalCell(
	face: number,
	n: number,
	i: number,
	j: number,
): FaceCell {
	if (i > 0 && j > 0 && i + j < n) return { face, i, j };
	const all = cellRepresentations(face, n, i, j);
	let best = all[0]!;
	for (const c of all) if (c.face < best.face) best = c;
	return best;
}
