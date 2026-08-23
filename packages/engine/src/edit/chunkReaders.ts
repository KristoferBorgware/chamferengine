import { chunksHolding } from "./chunksHolding.js";
import { joinPath } from "../addressing/lattice/joinPath.js";
import { neighbour } from "../addressing/neighbours/neighbour.js";

/**
 * Every same-level chunk a chunk's own mesher can read from, itself included.
 *
 * **A chunk's outside ring is one step in its OWN lattice, not one fine
 * cell.** A chunk built `lod` levels coarse is generated at a reduced
 * subdivision depth, so "one cell past the rim" is one *coarse* cell -- which
 * covers roughly `4^lod` fine cells and reaches that much further than the
 * fine chunk directly on the other side of the fine boundary. Deriving a
 * coarse chunk's readers from fine-cell adjacency alone misses every owner
 * whose ground sits between the fine boundary and the true coarse reach, which
 * is what left an edit undrawn once the chunk showing it had been built a
 * level or two coarser.
 *
 * Found the way {@link chunksHolding}'s own ring is found for one cell, run
 * over the chunk's whole rim instead: for every boundary lattice point,
 * whichever same-level chunk holds each of its six neighbours is a reader, at
 * the depth and level this chunk is actually being drawn at.
 */
export function chunkReaders(
	chunkKey: number,
	subdivisionDepth: number,
	chunkLevel: number,
): number[] {
	const span = 4 ** chunkLevel;
	const face = Math.floor(chunkKey / span);
	let value = chunkKey % span;
	const path: number[] = new Array<number>(chunkLevel);
	for (let level = chunkLevel - 1; level >= 0; level--) {
		path[level] = value % 4;
		value = Math.floor(value / 4);
	}

	const n = 1 << subdivisionDepth;
	const m = 1 << (subdivisionDepth - chunkLevel);
	const keys = new Set<number>([chunkKey]);

	for (let q = 0; q <= m; q++)
		for (let r = 0; q + r <= m; r++) {
			if (q > 0 && r > 0 && q + r < m) continue; // interior: nothing outside
			const [i, j] = joinPath(path, q, r, subdivisionDepth);
			for (let k = 0; k < 6; k++) {
				const nb = neighbour(face, n, i, j, k);
				if (!nb) continue;
				for (const { chunkKey: holder } of chunksHolding(
					{ ...nb, layer: 0 },
					subdivisionDepth,
					chunkLevel,
				))
					keys.add(holder);
			}
		}
	return [...keys];
}
