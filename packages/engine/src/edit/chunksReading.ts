import type { CellRef } from "./CellRef.js";
import { cellRepresentations } from "../addressing/neighbours/cellRepresentations.js";
import { chunksHolding } from "./chunksHolding.js";
import { neighbour } from "../addressing/neighbours/neighbour.js";

/**
 * Every chunk whose mesher reads a cell, which is wider than the set that
 * holds it.
 *
 * **A chunk meshes more cells than its triangle contains.** Its rim cells ask
 * the ring around them whether to draw a side face, and the apron draws that
 * ring outright -- and a cell one step past the rim sits *inside* the
 * neighbouring chunk's triangle, so {@link chunksHolding} never names this
 * chunk for it. Measured at depth 8 cut at chunk level 4, a chunk holds 153
 * slots and reads 54 more (`tools/probe-seam-edit.ts`).
 *
 * What that cost while the store used the holding set alone: break a block just
 * across a boundary and the neighbour's apron went on drawing the seed's cap
 * there, so mining across a chunk edge left a one-cell ridge along it. And a
 * rim cell asking about a column somebody had dug away still read solid ground
 * and drew no wall, so the side of the tunnel was missing and the far side of
 * the planet showed through.
 *
 * A chunk reads a cell when it holds it, or when it holds any neighbour of it.
 * So this is the holders of the cell and of each cell in its ring -- which is
 * the candidate walk `chunksHolding` already makes, kept rather than discarded.
 */
export function chunksReading(
	cell: CellRef,
	subdivisionDepth: number,
	chunkLevel: number,
): number[] {
	const n = 1 << subdivisionDepth;
	const keys = new Set<number>();
	const add = (at: CellRef): void => {
		for (const { chunkKey } of chunksHolding(
			at,
			subdivisionDepth,
			chunkLevel,
		))
			keys.add(chunkKey);
	};

	add(cell);
	// The ring under each face the cell has a name on: a cell on a face edge
	// has neighbours the other face's coordinates are the only way to reach.
	for (const named of cellRepresentations(cell.face, n, cell.i, cell.j))
		for (let k = 0; k < 6; k++) {
			const ring = neighbour(named.face, n, named.i, named.j, k);
			if (ring) add({ ...cell, face: ring.face, i: ring.i, j: ring.j });
		}
	return [...keys];
}
