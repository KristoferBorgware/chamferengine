import type { FaceCell } from "../neighbours/FaceCell.js";
import { acrossEdge } from "../neighbours/acrossEdge.js";
import { latticeWeights } from "./latticeWeights.js";

/**
 * The lattice point `(di, dj)` away from `(face, i, j)`, crossing faces.
 *
 * {@link acrossEdge} carries a whole step and not only a single one -- a point
 * on a face is three integer weights on that face's three **global** vertex
 * numbers, and that description never mentions a face, so sending
 * `(alpha, beta, gamma)` to `(alpha + gamma, beta + gamma, -gamma)` writes the
 * same point under the neighbouring face's name however far outside it fell.
 * `neighbour` is this with a one-cell step and a pentagon case; this is the
 * same reflection applied to an offset of any size, which is what stamping a
 * shape recorded once and applied everywhere needs.
 *
 * **The repair loops, because a corner leaves two weights negative.** One
 * reflection fixes one of them and may leave the other, so it runs until every
 * weight is in range. Three passes is the most any offset short of a whole face
 * needs, and the loop stops rather than spinning if one ever does not converge.
 *
 * **Around the twelve pentagons this is an approximation, not an address.** A
 * pentagon is a lattice point whose ring is five long, so a straight run of
 * offsets past one does not land where a walk of single steps would. What comes
 * back is still a real cell; it is the wrong one by a step or so, over the
 * fraction of the sphere within one shape's reach of a pentagon.
 */
export function cellOffset(
	face: number,
	n: number,
	i: number,
	j: number,
	di: number,
	dj: number,
): FaceCell {
	let here = face;
	let ni = i + di;
	let nj = j + dj;
	for (let pass = 0; pass < 4; pass++) {
		const w = latticeWeights(n, ni, nj);
		let negative = -1;
		for (let x = 0; x < 3; x++) if (w[x]! < 0) negative = x;
		if (negative < 0) return { face: here, i: ni, j: nj };
		const moved = acrossEdge(here, w, negative);
		here = moved.face;
		ni = moved.i;
		nj = moved.j;
	}
	return { face: here, i: ni, j: nj };
}
