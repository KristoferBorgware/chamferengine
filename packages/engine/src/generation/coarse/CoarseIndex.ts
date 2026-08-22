import { Vec3 } from "../../math/Vec3.js";
import { acrossEdge } from "../../addressing/neighbours/acrossEdge.js";
import { barycentricOf } from "../../addressing/lookup/barycentricOf.js";
import { chunkSlots } from "../../addressing/lattice/chunkSlots.js";
import { faceOf } from "../../addressing/lookup/faceOf.js";
import { latticeWeights } from "../../addressing/lattice/latticeWeights.js";
import { rank } from "../../addressing/lattice/rank.js";

/** Three cells and the weights a direction mixes them by. */
export interface CoarseBlend {
	readonly cells: Int32Array;
	readonly weights: Float64Array;
}

/** A scratch blend, for a caller reading many places. */
export function makeBlend(): CoarseBlend {
	return { cells: new Int32Array(3), weights: new Float64Array(3) };
}

/**
 * One field read through a blend.
 *
 * A cell of `-1` is a corner the reflection could not name and reads as zero,
 * which is what the single-field lookup has always done.
 */
export function readBlend(field: Float32Array, blend: CoarseBlend): number {
	const { cells, weights } = blend;
	return (
		weights[0]! * (cells[0]! < 0 ? 0 : field[cells[0]!]!) +
		weights[1]! * (cells[1]! < 0 ? 0 : field[cells[1]!]!) +
		weights[2]! * (cells[2]! < 0 ? 0 : field[cells[2]!]!)
	);
}

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
	/**
	 * A field read at a direction, blended between the three cells around it.
	 *
	 * The same lookup the terrain generator reads the map with: the direction
	 * gives a face and three weights, the weights give a fractional `(i, j)`,
	 * and the three lattice points it stands between are mixed by the fractions
	 * left over. Anything asking the map what the ground is at a place rather
	 * than at a cell goes through this.
	 */
	sampleAt(field: Float32Array, dir: Vec3): number {
		this.blendInto(dir, this.blend);
		return readBlend(field, this.blend);
	}

	/** The one blend `sampleAt` reads through, so a lone read allocates nothing. */
	private readonly blend: CoarseBlend = makeBlend();

	/**
	 * Where a direction lands: three cells, and the weights they are mixed by.
	 *
	 * **The lookup is the expensive part and the fields are not.** Finding the
	 * face, the barycentric weights and the three cells around a point is a
	 * dozen times the work of the three multiplies that follow it, so anything
	 * reading several fields at one place -- a picture of the planet reads
	 * five -- does this once and reads each field off it. Measured on the
	 * bench's 256-wide planet picture, four `sampleAt` calls a pixel are
	 * `70 ms` where one blend and four reads are under twenty.
	 *
	 * The blend is written into a caller's own scratch, because the caller is
	 * a loop over tens of thousands of places.
	 */
	blendInto(dir: Vec3, into: CoarseBlend): void {
		const face = faceOf(dir);
		const w = barycentricOf(face, dir);
		const fi = Math.max(0, w[1] * this.n);
		const fj = Math.max(0, w[2] * this.n);
		const i0 = Math.min(this.n - 1, Math.floor(fi));
		const j0 = Math.min(this.n - 1 - i0, Math.floor(fj));
		const a = fi - i0;
		const b = fj - j0;
		const put = (
			at: number,
			i: number,
			j: number,
			weight: number,
		): void => {
			into.cells[at] = this.indexNear(face, i, j);
			into.weights[at] = weight;
		};
		// The remainders land in one of the two triangles the square of steps
		// is cut into, and which one decides the three corners.
		if (a + b <= 1) {
			put(0, i0, j0, 1 - a - b);
			put(1, i0 + 1, j0, a);
			put(2, i0, j0 + 1, b);
			return;
		}
		put(0, i0 + 1, j0, 1 - b);
		put(1, i0, j0 + 1, 1 - a);
		put(2, i0 + 1, j0 + 1, a + b - 1);
	}

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
