import type { CellRef } from "./CellRef.js";
import { hexRound } from "../addressing/index.js";

/**
 * The cell a fine one falls inside when the world is sampled `lod` levels
 * coarser.
 *
 * A coarse chunk keeps its path and drops the subdivision depth, so its lattice
 * points are the fine ones scaled by a power of two — which makes shifting
 * `(i, j)` right by the level look like the answer. It is not: a cell is the
 * region around a lattice point rather than a square, and a shift is a floor.
 * Over a planet it names the wrong cell for 43.9% of cells one level out and
 * 79.3% four levels out.
 *
 * Scale the three barycentric weights and repair them instead. A lattice
 * point's barycentric recovers its own `(n-i-j, i, j)` exactly, because the
 * one-shot blend is a gnomonic projection, so the coarse lookup is `hexRound`
 * on those three numbers divided by `2 ^ lod`. Where it disagrees with a full
 * position lookup the fine cell sits exactly on the boundary between two coarse
 * cells and both are the same distance away.
 *
 * The layer needs no repair. Layers stack at a fixed thickness from a crust top
 * that does not move with the level, so a fine layer falls in `layer >> lod`.
 */
export function coarseCell(
	cell: CellRef,
	subdivisionDepth: number,
	lod: number,
): CellRef {
	if (lod === 0) return cell;
	const n = 1 << subdivisionDepth;
	const scale = 1 << lod;
	const [, i, j] = hexRound(
		(n - cell.i - cell.j) / scale,
		cell.i / scale,
		cell.j / scale,
		n >> lod,
	);
	return { face: cell.face, i, j, layer: cell.layer >> lod };
}
