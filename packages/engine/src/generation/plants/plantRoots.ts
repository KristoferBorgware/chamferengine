import type { Vec3 } from "../../math/Vec3.js";
import { canonicalCell } from "../../addressing/neighbours/canonicalCell.js";
import { directionToCell } from "../../addressing/lookup/directionToCell.js";
import { latticePosition } from "../../addressing/lattice/latticePosition.js";
import { neighbour } from "../../addressing/neighbours/neighbour.js";

/**
 * Every cell a plant may be rooted in, at the finest lattice.
 *
 * **The planting lattice is the finest one at every level of detail.** A root
 * is a cell, and a coarse chunk's cells are not a fine chunk's cells -- hashing
 * its own would choose a different forest at every level and a tree would come
 * and go as the player walked. So this walk is the same size however coarsely
 * the ground is drawn, which makes it the one part of a chunk whose cost does
 * not fall with distance.
 */
export interface PlantRoots {
	readonly count: number;

	/** The lattice this is cut at: `n = 2^level`. */
	readonly level: number;

	readonly face: Int32Array;
	readonly i: Int32Array;
	readonly j: Int32Array;

	/** Per root, its unit direction. */
	readonly directions: Float64Array;
}

/** The cells within `rings` hops of a direction, canonicalised. */
export function plantRoots(at: Vec3, level: number, rings: number): PlantRoots {
	const n = 2 ** level;
	const found = directionToCell(at, n);
	const start = canonicalCell(found.face, n, found.i, found.j);
	const keyOf = (face: number, i: number, j: number): number =>
		(face * (n + 1) + i) * (n + 1) + j;
	const seen = new Set<number>([keyOf(start.face, start.i, start.j)]);
	const held = [start];
	let frontier = [start];
	for (let ring = 0; ring < rings && frontier.length > 0; ring++) {
		const next: typeof frontier = [];
		for (const c of frontier)
			for (let d = 0; d < 6; d++) {
				const nb = neighbour(c.face, n, c.i, c.j, d);
				if (!nb) continue;
				const cell = canonicalCell(nb.face, n, nb.i, nb.j);
				const key = keyOf(cell.face, cell.i, cell.j);
				if (seen.has(key)) continue;
				seen.add(key);
				held.push(cell);
				next.push(cell);
			}
		frontier = next;
	}

	const count = held.length;
	const face = new Int32Array(count);
	const iOf = new Int32Array(count);
	const jOf = new Int32Array(count);
	const directions = new Float64Array(count * 3);
	for (let r = 0; r < count; r++) {
		const cell = held[r]!;
		face[r] = cell.face;
		iOf[r] = cell.i;
		jOf[r] = cell.j;
		const p = latticePosition(cell.face, n, cell.i, cell.j);
		directions[r * 3] = p.x;
		directions[r * 3 + 1] = p.y;
		directions[r * 3 + 2] = p.z;
	}
	return { count, level, face, i: iOf, j: jOf, directions };
}
