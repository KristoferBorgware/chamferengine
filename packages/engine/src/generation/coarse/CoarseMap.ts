import type { CoarseGrid } from "./CoarseGrid.js";
import { latticeWeights } from "../../addressing/lattice/latticeWeights.js";

/**
 * Where the land, the water and the rivers are, across the whole planet.
 *
 * Rivers, erosion and continents are the three things a noise function cannot
 * produce, because all three depend on the whole planet rather than on a
 * neighbourhood: where water goes from here is decided by ground it has not
 * reached yet. This map is computed once, at world creation, and read
 * afterwards as an input — which is what lets the runtime generator stay a pure
 * function of a position.
 *
 * It describes the **generated** world and is never rewritten. That keeps it a
 * function of the seed alone, so a client regenerates it instead of
 * downloading it, and a dam built later does not move a river on it.
 *
 * The fields are `float32`, four bytes a cell: 2.5 MB each at level 8.
 */
export class CoarseMap {
	readonly seed: number;
	readonly grid: CoarseGrid;

	/** The height that leaves the intended fraction of the surface as land. */
	readonly seaLevel: number;

	/** The ground surface, after erosion has cut into it. */
	readonly height: Float32Array;

	/**
	 * The surface water stands on: sea level over the ocean, the lake surface
	 * over a flooded basin, and the ground everywhere else.
	 */
	readonly water: Float32Array;

	/** How many cells drain through each one. A river is a large value. */
	readonly flow: Float32Array;

	/** The largest height difference from each cell to a neighbour. */
	readonly slope: Float32Array;

	constructor(
		seed: number,
		grid: CoarseGrid,
		seaLevel: number,
		height: Float32Array,
		water: Float32Array,
		flow: Float32Array,
		slope: Float32Array,
	) {
		this.seed = seed;
		this.grid = grid;
		this.seaLevel = seaLevel;
		this.height = height;
		this.water = water;
		this.flow = flow;
		this.slope = slope;
	}

	get level(): number {
		return this.grid.level;
	}

	/**
	 * Read a field at a cell of a finer grid.
	 *
	 * A coarse cell sits exactly on a fine cell — the one whose `(i, j)` are
	 * multiples of `2^(depth - level)` — because both come from the same
	 * barycentric blend evaluated at different resolutions. So finding the
	 * coarse samples around a fine cell is masking the low bits of `(i, j)`,
	 * and the bits masked off are the weights to mix them with. There is no
	 * second structure and no search.
	 *
	 * The masking is of `(i, j)`, not of the path digits in a cell ID. Path
	 * digits name a triangle, and a cell is a vertex.
	 */
	sample(
		field: Float32Array,
		face: number,
		i: number,
		j: number,
		depth: number,
	): number {
		const shift = depth - this.grid.level;
		const step = 1 << shift;
		const mask = step - 1;
		const baseI = i >> shift;
		const baseJ = j >> shift;
		const a = (i & mask) / step;
		const b = (j & mask) / step;

		// The remainders land in one of the two triangles the coarse cell's
		// square of steps is cut into, and which one decides the three corners.
		if (a + b <= 1)
			return (
				(1 - a - b) * this.at(field, face, baseI, baseJ) +
				a * this.at(field, face, baseI + 1, baseJ) +
				b * this.at(field, face, baseI, baseJ + 1)
			);
		return (
			(1 - b) * this.at(field, face, baseI + 1, baseJ) +
			(1 - a) * this.at(field, face, baseI, baseJ + 1) +
			(a + b - 1) * this.at(field, face, baseI + 1, baseJ + 1)
		);
	}

	/** The ground surface under a fine cell. */
	heightAt(face: number, i: number, j: number, depth: number): number {
		return this.sample(this.height, face, i, j, depth);
	}

	/** The surface water stands on above a fine cell. */
	waterAt(face: number, i: number, j: number, depth: number): number {
		return this.sample(this.water, face, i, j, depth);
	}

	/** How much drains through a fine cell's coarse neighbourhood. */
	flowAt(face: number, i: number, j: number, depth: number): number {
		return this.sample(this.flow, face, i, j, depth);
	}

	/** How steeply the ground falls away under a fine cell. */
	slopeAt(face: number, i: number, j: number, depth: number): number {
		return this.sample(this.slope, face, i, j, depth);
	}

	/**
	 * One coarse sample, by face and offset.
	 *
	 * A corner the interpolation asks for can sit outside the face triangle,
	 * and only ever with a weight of zero: reaching `I + J = n` requires the
	 * remainders to be zero, which puts the whole weight on the corner itself.
	 * Reading zero there keeps the sum right without a special case upstream.
	 */
	private at(
		field: Float32Array,
		face: number,
		i: number,
		j: number,
	): number {
		const w = latticeWeights(this.grid.n, i, j);
		if (w[0] < 0) return 0;
		return field[this.grid.indexOf(face, i, j)]!;
	}
}
