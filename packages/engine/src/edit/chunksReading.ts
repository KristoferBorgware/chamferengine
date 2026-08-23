import type { CellRef } from "./CellRef.js";
import { MESHER_REACH } from "./MESHER_REACH.js";
import { chunksHolding } from "./chunksHolding.js";
import { ringAround } from "./ringAround.js";

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
 * A chunk reads a cell when it holds it, or when it holds a cell within
 * {@link MESHER_REACH} steps of it. So this is the holders of the cell and of
 * every cell in that ring.
 */
export function chunksReading(
	cell: CellRef,
	subdivisionDepth: number,
	chunkLevel: number,
): number[] {
	const n = 1 << subdivisionDepth;
	const keys = new Set<number>();
	for (const near of ringAround([cell], n, MESHER_REACH))
		for (const { chunkKey } of chunksHolding(
			{ ...cell, ...near },
			subdivisionDepth,
			chunkLevel,
		))
			keys.add(chunkKey);
	return [...keys];
}
