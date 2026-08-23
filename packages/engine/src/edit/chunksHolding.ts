import type { CellRef } from "./CellRef.js";
import { cellRepresentations } from "../addressing/neighbours/cellRepresentations.js";
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
 * **Found by descending the triangles, not by asking the cell's ring.** The
 * ring is the obvious candidate list and it is wrong at a corner: the only
 * neighbours a corner has inside its own triangle sit on that triangle's two
 * edges, so both are shared, and if the border rule awards both to lower-keyed
 * chunks the triangle whose corner it is never appears at all. Descending
 * cannot miss one -- triangles nest, so a chunk containing the point has an
 * ancestor containing it at every level above.
 *
 * At most six triangles contain a lattice point, so the walk carries at most
 * six live paths however deep the cut is.
 */
export function chunksHolding(
	cell: CellRef,
	subdivisionDepth: number,
	chunkLevel: number,
): HoldingChunk[] {
	const n = 1 << subdivisionDepth;
	const out: HoldingChunk[] = [];
	const seen = new Set<number>();

	// The cell under each face it has a name on, so a cell on a face edge
	// reaches the chunks on both sides of it.
	for (const named of cellRepresentations(cell.face, n, cell.i, cell.j)) {
		let live = [{ path: 0, q: named.i, r: named.j, side: n }];
		for (let level = 0; level < chunkLevel; level++) {
			const next: typeof live = [];
			for (const at of live) {
				const side = at.side >> 1;
				for (let digit = 0; digit < 4; digit++) {
					let q = at.q;
					let r = at.r;
					if (digit === 1) q -= side;
					else if (digit === 2) r -= side;
					else if (digit === 3) {
						q = side - q;
						r = side - r;
					}
					if (q < 0 || r < 0 || q + r > side) continue;
					next.push({ path: at.path * 4 + digit, q, r, side });
				}
			}
			live = next;
		}
		const m = 1 << (subdivisionDepth - chunkLevel);
		for (const at of live) {
			const chunkKey = named.face * 4 ** chunkLevel + at.path;
			if (seen.has(chunkKey)) continue;
			seen.add(chunkKey);
			out.push({ chunkKey, slot: rank(at.q, at.r, m) });
		}
	}
	return out;
}
