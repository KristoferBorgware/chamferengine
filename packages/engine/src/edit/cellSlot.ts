import type { CellRef } from "./CellRef.js";
import { rank, splitPath } from "../addressing/index.js";

/** Which chunk holds a cell, and which slot of it the cell sits in. */
export interface CellSlot {
	/** The chunk's own key: face and path packed the way a chunk address packs them. */
	readonly chunkKey: number;
	readonly slot: number;
}

/**
 * Cut a cell's lattice offset into the chunk that holds it and the slot inside.
 *
 * A cell sitting on a chunk border belongs to two or three triangles at once
 * and is awarded to the lowest chunk key, which `splitPath` produces by
 * descending the same way every time.
 */
export function cellSlot(
	cell: CellRef,
	subdivisionDepth: number,
	chunkLevel: number,
): CellSlot {
	const cut = splitPath(cell.i, cell.j, subdivisionDepth, chunkLevel);
	let path = 0;
	for (const digit of cut.path) path = path * 4 + digit;
	const m = 1 << (subdivisionDepth - chunkLevel);
	return {
		chunkKey: cell.face * 4 ** chunkLevel + path,
		slot: rank(cut.q, cut.r, m),
	};
}
