import { chunkSlots } from "../../addressing/lattice/chunkSlots.js";
import { rank } from "../../addressing/lattice/rank.js";

/**
 * Which cell a face-and-offset names, at one subdivision level.
 *
 * This is everything reading the coarse map takes: one table from
 * `face * slots + rank(i, j)` to a cell number. Building the map also needs the
 * ring of neighbours and each cell's direction, and {@link CoarseGrid} adds
 * those. Once the map is built they are 31 MB nothing reads, so a worker
 * receives an index and not a grid.
 */
export class CoarseIndex {
	readonly level: number;

	/** Lattice steps along a face edge, `2^level`. */
	readonly n: number;

	readonly count: number;

	/** `face * slots + rank(i, j)` to cell number, for all twenty faces. */
	readonly faceIndex: Int32Array;

	protected readonly slots: number;

	constructor(level: number, faceIndex: Int32Array) {
		this.level = level;
		this.n = 1 << level;
		this.slots = chunkSlots(this.n);
		this.count = 10 * 4 ** level + 2;
		this.faceIndex = faceIndex;
	}

	/** The cell a face-and-offset names. */
	indexOf(face: number, i: number, j: number): number {
		return this.faceIndex[face * this.slots + rank(i, j, this.n)]!;
	}
}
