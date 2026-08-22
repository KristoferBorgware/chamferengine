import type { CellRef } from "./CellRef.js";
import { cellRepresentations } from "../addressing/neighbours/cellRepresentations.js";
import { cellSlot } from "./cellSlot.js";
import { neighbour } from "../addressing/neighbours/neighbour.js";
import { offsetIn } from "./offsetIn.js";
import { rank } from "../addressing/lattice/rank.js";

/** A chunk key, and the cell's own offset under that chunk's face. */
export interface HoldingChunk {
	readonly chunkKey: number;
	readonly slot: number;
}

/**
 * Every chunk whose triangle contains a cell.
 *
 * A cell on a chunk border sits in two triangles and one on a corner in
 * several. Only the lowest of them owns it, and all of them **read** it: a
 * chunk generates every slot of its own triangle so the mesher can decide
 * whether to emit a face on its rim without fetching a neighbour. A change
 * written to the owner alone leaves the others deciding from ground that has
 * moved, which shows up as a face missing or drawn along a chunk edge.
 *
 * Found by asking the cell's own ring, under each of the faces the cell has a
 * name on. A chunk holding any neighbour of the cell is a candidate, and
 * `offsetIn` says exactly whether it holds the cell as well -- 17% of a chunk's
 * slots sit on its border, so this is not a rare case to leave to a rounding
 * rule.
 */
export function chunksHolding(
	cell: CellRef,
	subdivisionDepth: number,
	chunkLevel: number,
): HoldingChunk[] {
	const n = 1 << subdivisionDepth;
	const span = 4 ** chunkLevel;
	const out: HoldingChunk[] = [];
	const seen = new Set<number>();

	// The cell under each face it has a name on, so a cell on a face edge
	// reaches the chunks on both sides of it.
	for (const named of cellRepresentations(cell.face, n, cell.i, cell.j)) {
		const here = { ...cell, face: named.face, i: named.i, j: named.j };
		const candidates = [here];
		for (let k = 0; k < 6; k++) {
			const ring = neighbour(named.face, n, named.i, named.j, k);
			if (ring)
				candidates.push({ ...here, face: ring.face, i: ring.i, j: ring.j });
		}
		for (const candidate of candidates) {
			const key = cellSlot(candidate, subdivisionDepth, chunkLevel).chunkKey;
			// The face is checked before the key is marked seen. A ring
			// neighbour across a face edge produces a key under its own face,
			// which this cell is not in -- marking that key first would hide
			// the chunk of the same number under the cell's own face.
			if (Math.floor(key / span) !== named.face) continue;
			if (seen.has(key)) continue;
			seen.add(key);
			let value = key % span;
			const path = new Array<number>(chunkLevel);
			for (let level = chunkLevel - 1; level >= 0; level--) {
				path[level] = value % 4;
				value = Math.floor(value / 4);
			}
			const offset = offsetIn(path, named.i, named.j, subdivisionDepth);
			if (!offset) continue;
			out.push({
				chunkKey: key,
				slot: rank(offset.q, offset.r, 1 << (subdivisionDepth - chunkLevel)),
			});
		}
	}
	return out;
}
