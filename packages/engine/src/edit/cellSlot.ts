import type { CellRef } from "./CellRef.js";
import { canonicalCell, rank, splitPath } from "../addressing/index.js";

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
 *
 * **The name is canonicalised first, because a cell on a face edge has more
 * than one.** Five faces meet at an icosahedron vertex and two along every
 * edge, so the same cell arrives here under whichever face the caller's lookup
 * happened to produce -- and `positionToCell` produces both, splitting an edge
 * cell's own hexagon roughly in half. Keying the row by the raw face gives that
 * one cell **two rows**: place a block standing on one side of it and break it
 * standing on the other, and the break lands in a row nothing reads, so the
 * block can never be removed. Every sibling rule here already reconciles the
 * names -- `encodeCell` and `owns` canonicalise, `chunksHolding` enumerates --
 * and this was the one that did not.
 */
export function cellSlot(
	cell: CellRef,
	subdivisionDepth: number,
	chunkLevel: number,
): CellSlot {
	const named = canonicalCell(
		cell.face,
		1 << subdivisionDepth,
		cell.i,
		cell.j,
	);
	const cut = splitPath(named.i, named.j, subdivisionDepth, chunkLevel);
	let path = 0;
	for (const digit of cut.path) path = path * 4 + digit;
	const m = 1 << (subdivisionDepth - chunkLevel);
	return {
		chunkKey: named.face * 4 ** chunkLevel + path,
		slot: rank(cut.q, cut.r, m),
	};
}
