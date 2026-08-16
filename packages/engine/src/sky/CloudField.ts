import { Vec3 } from "../math/Vec3.js";
import { fbm } from "../generation/noise/fbm.js";
import { latticePosition } from "../addressing/lattice/latticePosition.js";
import { windRotation } from "./windRotation.js";

/**
 * The clouds over the whole planet, as lattice points at one level.
 *
 * A cloud **borrows the lattice and is not a cell**. The construction that puts
 * cells on a sphere does not mention a radius, so the same hexagons are
 * available at any height, and a cloud sits on one of them.
 *
 * It has no cell ID, no chunk and no layer, and that is what keeps it cosmetic
 * by construction rather than by anyone remembering. `layer` counts downward
 * from the crust top, so there is no value a cloud could take; and everything
 * that stores a thing -- the delta store, the side table, interest, an edit
 * message -- is keyed by cell ID. Withholding the address withholds the
 * ability to store it.
 *
 * A cloud is a point in a buffer, the way a vertex is rather than the way a
 * block is. Level 5 is a 64 m puff and 10,242 points for the whole sky, against
 * 41,943,042 cells in one surface layer.
 */
export class CloudField {
	readonly level: number;
	readonly n: number;

	/** How many lattice points carry a cloud, over the whole sky. */
	readonly count: number;

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

	constructor(level: number) {
		this.level = level;
		this.n = 1 << level;
		this.count = 10 * 4 ** level + 2;
		this.directions = new Float64Array(this.count * 3);
		this.cover = new Float32Array(this.count);
		this.faces = new Uint8Array(this.count);
		this.offsets = new Uint16Array(this.count * 2);

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
					next++;
				}
	}

	/**
	 * Refill the cover from the noise, with the wind having turned by `angle`.
	 *
	 * The sample point is rotated before the lookup, so the pattern travels
	 * rigidly and nothing is stretched at one place and bunched at another.
	 */
	blow(
		axis: Vec3,
		angle: number,
		seed: number,
		frequency = 2.4,
		octaves = 4,
		coverage = 0.42,
	): void {
		for (let at = 0; at < this.count; at++) {
			const here = new Vec3(
				this.directions[at * 3]!,
				this.directions[at * 3 + 1]!,
				this.directions[at * 3 + 2]!,
			);
			const from = windRotation(here, axis, -angle);
			const value = fbm(from.x, from.y, from.z, frequency, octaves, seed);
			this.cover[at] = Math.max(0, value - (1 - 2 * coverage)) / coverage;
		}
	}
}
