import type { FaceCell } from "./FaceCell.js";
import { FACES } from "../solid/icosahedron.js";
import { FACE_ADJACENCY } from "../solid/faceAdjacency.js";
import { offsetOn } from "./offsetOn.js";

/**
 * The five neighbours of the pentagon on icosahedron vertex `p`, in order
 * around it, starting from the step `startFace` takes toward its own next
 * vertex.
 *
 * The ring is built by rotating face to face around the vertex rather than by
 * reflecting across one edge. Two of the five faces meeting at a vertex touch
 * the starting face only at that vertex, so a single reflection cannot reach
 * them.
 */
export function pentagonRing(
	p: number,
	n: number,
	startFace: number,
): FaceCell[] {
	let g = startFace;
	const ring: FaceCell[] = [];
	for (let s = 0; s < 5; s++) {
		const e = FACES[g]!.indexOf(p);
		// Faces wind A -> B -> C counter-clockwise from outside, so at vertex p the
		// next cell round is the one toward the following vertex, and the next face
		// round is the one across the edge that arrives back at p.
		const x = FACES[g]![(e + 1) % 3]!;
		const cell = offsetOn(
			g,
			new Map([
				[p, n - 1],
				[x, 1],
			]),
		);
		if (cell) ring.push(cell);
		g = FACE_ADJACENCY[g]![(e + 2) % 3]!.face;
	}
	return ring;
}
