import type { CaveCellPlan } from "./caveCellsOf.js";
import type { ColumnPatch } from "chamfer/mesh";

/** A patch with its far corner taken off, and where each column came from. */
export interface CutPatch {
	readonly patch: ColumnPatch;

	/** Per column of the cut patch, its index in the patch it was cut from. */
	readonly keep: Int32Array;
}

/**
 * The patch with a corner removed, so the passages can be looked into.
 *
 * **A cell the cut takes is removed from the world rather than hidden.** The
 * mesher draws a wall wherever a column's neighbour is off the patch, so a
 * removed neighbour gets one and the cut reads as a cross-section rather than
 * as a hole in the shell.
 *
 * **Cut in the frame the patch is drawn in, not in the lattice.** A hexagon
 * lattice on a sphere has no rows and columns to count off, and a cut has to be
 * a plane a reader can see the far side of -- so the two fractions run along the
 * patch's own east and north, which are the axes the mesh itself is laid out on.
 * At `1` nothing is taken and the mesh is the whole patch to the bit.
 */
export function cutPatch(
	patch: ColumnPatch,
	cells: CaveCellPlan,
	across: number,
	along: number,
): CutPatch {
	const { count } = patch;
	const wallEast = cells.low[0] + (cells.high[0] - cells.low[0]) * across;
	const wallNorth = cells.low[1] + (cells.high[1] - cells.low[1]) * along;
	const keptOf = new Int32Array(count).fill(-1);
	const keep: number[] = [];
	for (let c = 0; c < count; c++) {
		if (cells.at[c * 2]! > wallEast || cells.at[c * 2 + 1]! > wallNorth)
			continue;
		keptOf[c] = keep.length;
		keep.push(c);
	}

	const kept = keep.length;
	const face = new Int32Array(kept);
	const iOf = new Int32Array(kept);
	const jOf = new Int32Array(kept);
	const directions = new Float64Array(kept * 3);
	const degree = new Uint8Array(kept);
	const corner = new Float64Array(kept * 18);
	const ring = new Int32Array(kept * 6).fill(-1);
	for (let n = 0; n < kept; n++) {
		const c = keep[n]!;
		face[n] = patch.face[c]!;
		iOf[n] = patch.i[c]!;
		jOf[n] = patch.j[c]!;
		degree[n] = patch.degree[c]!;
		for (let a = 0; a < 3; a++)
			directions[n * 3 + a] = patch.directions[c * 3 + a]!;
		for (let a = 0; a < 18; a++)
			corner[n * 18 + a] = patch.corner[c * 18 + a]!;
		for (let k = 0; k < 6; k++) {
			const to = patch.ring[c * 6 + k]!;
			ring[n * 6 + k] = to < 0 ? -1 : keptOf[to]!;
		}
	}

	return {
		patch: {
			count: kept,
			level: patch.level,
			face,
			i: iOf,
			j: jOf,
			directions,
			degree,
			corner,
			ring,
			// **The middle does not move with the cut.** It is what the mesh's
			// own frame is built from, so a patch that re-centred as a corner
			// came off would slide across the window while it was being opened.
			centre: patch.centre,
			whole: patch.whole && kept === count,
		},
		keep: Int32Array.from(keep),
	};
}
