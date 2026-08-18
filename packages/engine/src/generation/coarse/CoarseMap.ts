import type { CoarseMapSnapshot } from "./CoarseMapSnapshot.js";
import { CoarseIndex } from "./CoarseIndex.js";
import { latticeWeights } from "../../addressing/lattice/latticeWeights.js";

/**
 * The height of the ground everywhere on the planet, in metres above sea level.
 *
 * **This map is the world.** The terrain generator reads a height off it and
 * adds nothing: no second noise field, no multiplier, no detail tier. So the
 * picture the editor draws and the ground a player stands on are the same
 * numbers, and a knob that does not move the picture does not move the world
 * either.
 *
 * Computed once, at world creation, and read afterwards as an input -- which is
 * what lets the runtime generator stay a pure function of a position. It
 * describes the **generated** world and is never rewritten, so it stays a
 * function of the seed alone: a client regenerates it instead of downloading
 * it, and a wall built later does not move the ground on it.
 *
 * Two fields, `float32`, four bytes a cell: 2.5 MB each at level 8.
 */
export class CoarseMap {
	readonly seed: number;

	/** Which cell a face-and-offset names, at this map's level. */
	readonly index: CoarseIndex;

	/**
	 * The ground surface in metres above sea level, after erosion.
	 *
	 * Sea level is zero by construction rather than by a stored number: the
	 * percentile that leaves the intended land above it is subtracted before
	 * the field is scaled into metres. So "is this land" is `height > 0`, and
	 * water stands wherever it is not.
	 */
	readonly height: Float32Array;

	/** How steeply the ground falls away, as metres per metre. */
	readonly slope: Float32Array;

	constructor(
		seed: number,
		index: CoarseIndex,
		height: Float32Array,
		slope: Float32Array,
	) {
		this.seed = seed;
		this.index = index;
		this.height = height;
		this.slope = slope;
	}

	get level(): number {
		return this.index.level;
	}

	get count(): number {
		return this.index.count;
	}

	/**
	 * The map in a form that crosses to a worker.
	 *
	 * The typed arrays and nothing else. Building the map needs a ring of
	 * neighbours and a direction per cell, and neither is read afterwards, so
	 * sending a whole grid would copy 31 MB per worker that no worker touches.
	 */
	toSnapshot(): CoarseMapSnapshot {
		return {
			seed: this.seed,
			level: this.index.level,
			faceIndex: this.index.faceIndex,
			height: this.height,
			slope: this.slope,
		};
	}

	/** Rebuild a map from what crossed to the worker. */
	static fromSnapshot(snapshot: CoarseMapSnapshot): CoarseMap {
		return new CoarseMap(
			snapshot.seed,
			new CoarseIndex(snapshot.level, snapshot.faceIndex),
			snapshot.height,
			snapshot.slope,
		);
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
		const shift = depth - this.index.level;

		// A grid coarser than the map reads it directly. Lattices at different
		// depths nest exactly -- the point `(i, j)` at one depth is `(2i, 2j)`
		// at the next -- so the coarse cell is named rather than interpolated,
		// and there is nothing to mix.
		if (shift <= 0) {
			const up = -shift;
			return this.at(field, face, i << up, j << up);
		}

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

	/** Metres above sea level under a fine cell. */
	heightAt(face: number, i: number, j: number, depth: number): number {
		return this.sample(this.height, face, i, j, depth);
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
		const w = latticeWeights(this.index.n, i, j);
		if (w[0] < 0) return 0;
		return field[this.index.indexOf(face, i, j)]!;
	}
}
