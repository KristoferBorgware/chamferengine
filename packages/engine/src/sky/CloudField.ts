import { Vec3 } from "../math/Vec3.js";
import { fbm } from "../generation/noise/fbm.js";
import { latticePosition } from "../addressing/lattice/latticePosition.js";
import { chunkSlots } from "../addressing/lattice/chunkSlots.js";
import { rank } from "../addressing/lattice/rank.js";
import { windRotation } from "./windRotation.js";

/** Offset from the world seed, so the volume differs from the horizontal cover. */
const SHAPE_SEED_OFFSET = 3;

/**
 * The clouds over the whole planet, as lattice points at one level, each
 * carrying a stack of shells.
 *
 * A cloud **borrows the lattice and is not a cell**. The construction that puts
 * cells on a sphere does not mention a radius, so the same hexagons are
 * available at any height, and a cloud sits on a stack of them.
 *
 * It has no cell ID, no chunk and no layer, and that is what keeps it cosmetic
 * by construction rather than by anyone remembering. `layer` counts downward
 * from the crust top, so there is no value a cloud could take; and everything
 * that stores a thing -- the delta store, the side table, interest, an edit
 * message -- is keyed by cell ID. A shell index is a step into a transient
 * buffer, the way a vertex index is, and mints no address.
 *
 * A point is a point in a buffer, the way a vertex is rather than the way a
 * block is. Level 5 is a 64 m puff and 10,242 points for the whole sky, against
 * 41,943,042 cells in one surface layer.
 */
export class CloudField {
	readonly level: number;
	readonly n: number;

	/** How many lattice points carry a cloud, over the whole sky. */
	readonly count: number;

	/** How many shells deep the deck runs. One is a flat sheet. */
	readonly shells: number;

	/** Three components per point: the direction it sits in. */
	readonly directions: Float64Array;

	/** How thick the cloud is at each point, refilled as the wind turns. */
	readonly cover: Float32Array;

	/**
	 * Which face and offset each point sits on.
	 *
	 * Not an address: it names a lattice point, the way a vertex is named, and
	 * nothing keyed by cell ID will take it. It is here so the geometry can be
	 * drawn from the same points the cover was filled for, rather than a second
	 * walk agreeing with the first by luck.
	 */
	readonly faces: Uint8Array;
	readonly offsets: Uint16Array;

	/** Whether a point carries cloud at a shell, `count * shells` entries. */
	readonly solid: Uint8Array;

	/** `face * slots + rank(i, j)` to point index, for finding a neighbour. */
	private readonly faceIndex: Int32Array;
	private readonly slots: number;

	constructor(level: number, shells: number) {
		this.level = level;
		this.n = 1 << level;
		this.count = 10 * 4 ** level + 2;
		this.shells = shells;
		this.directions = new Float64Array(this.count * 3);
		this.cover = new Float32Array(this.count);
		this.faces = new Uint8Array(this.count);
		this.offsets = new Uint16Array(this.count * 2);
		this.solid = new Uint8Array(this.count * shells);
		this.slots = chunkSlots(this.n);
		this.faceIndex = new Int32Array(20 * this.slots).fill(-1);

		// Face by face, taking each shared point the first time a face claims
		// it. Nothing is addressed, so the order is the whole of the identity a
		// point has.
		let next = 0;
		const seen = new Set<string>();
		for (let face = 0; face < 20 && next < this.count; face++)
			for (let i = 0; i <= this.n; i++)
				for (let j = 0; i + j <= this.n; j++) {
					const p = latticePosition(face, this.n, i, j);
					const key = `${Math.round(p.x * 1e9)},${Math.round(p.y * 1e9)},${Math.round(p.z * 1e9)}`;
					if (seen.has(key)) continue;
					seen.add(key);
					this.directions[next * 3] = p.x;
					this.directions[next * 3 + 1] = p.y;
					this.directions[next * 3 + 2] = p.z;
					this.faces[next] = face;
					this.offsets[next * 2] = i;
					this.offsets[next * 2 + 1] = j;
					this.faceIndex[face * this.slots + rank(i, j, this.n)] =
						next;
					next++;
				}
	}

	/** The point index a face-and-offset names, or `-1` off the lattice. */
	indexOf(face: number, i: number, j: number): number {
		return this.faceIndex[face * this.slots + rank(i, j, this.n)] ?? -1;
	}

	/**
	 * Refill the cover and the shells from the noise, with the wind having
	 * turned by `angle`.
	 *
	 * Two fields, not one. `cover` is the same horizontal mass this carried as
	 * a flat deck -- where a cloud is, at all. `solid` gives it a third
	 * dimension: a second noise, sampled at each shell's true radius the way
	 * `caveDensity` samples rock, so climbing through the shells samples a
	 * genuinely different part of the field rather than repeating one disc.
	 *
	 * A shell's margin falls off with height and rises with `cover`, so a
	 * thicker point reliably fills its bottom shell and reaches further up
	 * before the shape noise can tip it empty -- taller in the middle of a
	 * cloud, thinner at its edge, with no separate knob for it. Measured over
	 * 400 samples at a fixed shell count: a point at the coverage floor fills a
	 * shell 1% of the time, one at `cover` 0.3 fills one to three 82% of the
	 * time, and one at 0.8 fills three or four 98% of the time.
	 *
	 * The sample point is rotated before the lookup, so the pattern travels
	 * rigidly and nothing is stretched at one place and bunched at another.
	 */
	blow(
		axis: Vec3,
		angle: number,
		seed: number,
		baseRadius: number,
		shellSpan: number,
		featureSize: number,
		frequency = 2.4,
		octaves = 4,
		coverage = 0.42,
		floor = 0.02,
	): void {
		const shapeSeed = (seed + SHAPE_SEED_OFFSET) | 0;
		const shapeFrequency = 1 / featureSize;
		for (let at = 0; at < this.count; at++) {
			const here = new Vec3(
				this.directions[at * 3]!,
				this.directions[at * 3 + 1]!,
				this.directions[at * 3 + 2]!,
			);
			const from = windRotation(here, axis, -angle);
			const value = fbm(from.x, from.y, from.z, frequency, octaves, seed);
			const cover = Math.max(0, value - (1 - 2 * coverage)) / coverage;
			this.cover[at] = cover;

			const base = at * this.shells;
			if (cover <= floor) {
				this.solid.fill(0, base, base + this.shells);
				continue;
			}
			for (let s = 0; s < this.shells; s++) {
				const radius = baseRadius + s * shellSpan;
				const shape = fbm(
					from.x * radius * shapeFrequency,
					from.y * radius * shapeFrequency,
					from.z * radius * shapeFrequency,
					1,
					3,
					shapeSeed,
				);
				const heightFraction =
					this.shells > 1 ? s / (this.shells - 1) : 0;
				const margin =
					cover * (1 - heightFraction * 0.85) + shape * 0.3 - 0.2;
				this.solid[base + s] = margin > 0 ? 1 : 0;
			}
		}
	}
}
