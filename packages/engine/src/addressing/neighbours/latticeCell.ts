import type { FaceCell } from "./FaceCell.js";
import { acrossEdge } from "./acrossEdge.js";
import { latticeWeights } from "../lattice/latticeWeights.js";

/**
 * The cell an extended lattice coordinate names.
 *
 * `(i, j)` is allowed outside the triangle `i, j >= 0, i + j <= n`, where it
 * describes a point on a neighbouring face written under this face's name. A
 * lattice point is the integer weights `(n-i-j, i, j)` on the face's three
 * global vertex numbers, so a point off the face is one negative weight, and
 * reflecting across the edge opposite that vertex renames the point without
 * moving it.
 *
 * Past a corner two weights go negative at once and the reflection runs again.
 * Four reflections cover the five faces meeting at an icosahedron vertex; a
 * coordinate further out than that comes back on whichever face the walk
 * reached, which is a neighbour of the right one.
 *
 * A coordinate inside the triangle is returned as it stands.
 */
export function latticeCell(
	face: number,
	n: number,
	i: number,
	j: number,
): FaceCell {
	let at: FaceCell = { face, i, j };
	for (let step = 0; step < 4; step++) {
		const w = latticeWeights(n, at.i, at.j);
		let leaving = -1;
		for (let x = 0; x < 3; x++)
			if (w[x]! < 0 && (leaving < 0 || w[x]! < w[leaving]!)) leaving = x;
		if (leaving < 0) return at;
		at = acrossEdge(at.face, w, leaving);
	}
	return at;
}
