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
 * cell it was given: measured over 1.08 million calls, `1,790 ms` against
 * `191 ms`, `9.4x` (`tools/trial-canonical.ts`).
 *
 * **That ratio is not a speed-up of anything the engine currently does, and
 * the trial says so at both ends.** `CoarseGrid` is the one path that
 * canonicalises in bulk and it already guards at its own call site with the
 * identical `shared` test, so world creation does not move — `2,923 ms`
 * against `2,907 ms` for the coarse map at level 8. A chunk build asks only
 * `1,550` times, about `1.4%` of its own `175 ms`, so generating and meshing
 * does not move either: `183 ms` a chunk against `176 ms`, inside a
 * run-to-run spread of `4,025–4,694 ms` over the same 24 chunks.
 *
 * What the guard buys is that a caller no longer has to know this. Bulk
 * canonicalising is a footgun without it, and `CoarseGrid` is a call site that
 * had to carry the test itself to avoid the trap.
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
