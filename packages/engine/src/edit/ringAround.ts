import type { FaceCell } from "../addressing/neighbours/FaceCell.js";
import { cellRepresentations } from "../addressing/neighbours/cellRepresentations.js";
import { neighbour } from "../addressing/neighbours/neighbour.js";

/**
 * The cells within `steps` of the ones given, themselves included.
 *
 * The ring is taken under **every face each cell has a name on**: five faces
 * meet at an icosahedron vertex and two along every edge, and a neighbour
 * across a face edge is reachable only through the other face's coordinates.
 * Cells are de-duplicated by name rather than by identity, so a cell with two
 * names is walked from both -- which costs a few repeats and never misses a
 * direction.
 */
export function ringAround(
	from: readonly FaceCell[],
	n: number,
	steps: number,
): FaceCell[] {
	const seen = new Map<string, FaceCell>();
	const keep = (cell: FaceCell): void => {
		seen.set(`${cell.face}:${cell.i}:${cell.j}`, cell);
	};
	let edge: FaceCell[] = [];
	for (const cell of from) {
		keep(cell);
		edge.push(cell);
	}

	for (let step = 0; step < steps; step++) {
		const next: FaceCell[] = [];
		for (const cell of edge)
			for (const named of cellRepresentations(
				cell.face,
				n,
				cell.i,
				cell.j,
			))
				for (let k = 0; k < 6; k++) {
					const ring = neighbour(named.face, n, named.i, named.j, k);
					if (!ring) continue;
					const key = `${ring.face}:${ring.i}:${ring.j}`;
					if (seen.has(key)) continue;
					seen.set(key, ring);
					next.push(ring);
				}
		edge = next;
	}
	return [...seen.values()];
}
