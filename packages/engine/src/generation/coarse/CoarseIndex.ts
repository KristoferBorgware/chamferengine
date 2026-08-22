import { acrossEdge } from "../../addressing/neighbours/acrossEdge.js";
import { chunkSlots } from "../../addressing/lattice/chunkSlots.js";
import { latticeWeights } from "../../addressing/lattice/latticeWeights.js";
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

	/**
	 * The cell at `(i, j)`, reaching one step past the face if it has to.
	 *
	 * A blend reads the three lattice points around a position, and near a face
	 * edge one of the three sits outside the triangle. It is a real cell on the
	 * face over that edge, so the reflection names it and a field runs across
	 * the seam without a break.
	 *
	 * **One reflection, so one weight may be negative and the other two must be
	 * positive.** A point past an icosahedron vertex has a negative weight on
	 * the far side of the reflection as well and needs the pentagon's own ring;
	 * the three corners of a blend never reach one, because they are the
	 * triangle the position stands in. Anything the reflection cannot name
	 * comes back as `-1`.
	 */
	indexNear(face: number, i: number, j: number): number {
		const w = latticeWeights(this.n, i, j);
		let negative = -1;
		for (let x = 0; x < 3; x++) if (w[x]! < 0) negative = x;
		if (negative < 0)
			return this.faceIndex[face * this.slots + rank(i, j, this.n)]!;
		const over = acrossEdge(face, w, negative);
		if (over.i < 0 || over.j < 0 || over.i + over.j > this.n) return -1;
		return this.faceIndex[
			over.face * this.slots + rank(over.i, over.j, this.n)
		]!;
	}
}
