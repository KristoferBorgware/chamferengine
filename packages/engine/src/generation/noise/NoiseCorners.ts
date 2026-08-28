import { hash3 } from "./hash3.js";

/**
 * The eight hashed corners of the lattice cell a noise reading last fell in.
 *
 * **A reading is its eight hashes and almost nothing else.** Timed on one
 * machine, a whole {@link valueNoise3} is `128 ns` and its eight `hash3` calls
 * are `132 ns` -- the fades and the weights do not register beside them. So a
 * caller that reads the field many times inside one lattice cell is hashing the
 * same eight numbers over and over.
 *
 * **Which is exactly what walking down a column does.** Every block of a column
 * stands on one ray, so the cliffs layer's sample point walks a straight line
 * through the field: over its `120 m` reach it crosses `4` cells of the widest
 * octave and `16` of the finest, and it takes `120` readings doing it. That is
 * `2,880` hashes where `224` would do.
 *
 * **A memo and not a promise.** The cell's own integer corner and the seed are
 * both checked, so a reading anywhere at any time gets the same answer it would
 * have got with no cache at all -- out-of-order callers simply miss. One slot
 * per octave, because a stack reads a different cell at every one.
 */
export class NoiseCorners {
	/** Per slot, the cell's base corner, and whether it has been filled. */
	private readonly at: Int32Array;
	private readonly ready: Uint8Array;

	/** Per slot, that cell's eight hashed corners. */
	private readonly held: Float64Array;

	/** The seed everything above was hashed with. */
	private seed = 0;

	constructor(slots: number) {
		this.at = new Int32Array(slots * 3);
		this.ready = new Uint8Array(slots);
		this.held = new Float64Array(slots * 8);
	}

	/** How many octaves this can hold at once. */
	get slots(): number {
		return this.ready.length;
	}

	/**
	 * The eight corners of one cell, hashed or remembered.
	 *
	 * They are written into {@link values} from `slot * 8`, in the order
	 * `valueNoise3` weights them: `x` fastest, then `y`, then `z`.
	 */
	get values(): Float64Array {
		return this.held;
	}

	/** Make sure `slot` holds this cell, hashing it if it does not. */
	fill(slot: number, xi: number, yi: number, zi: number, seed: number): void {
		const base = slot * 3;
		if (
			this.ready[slot] === 1 &&
			this.seed === seed &&
			this.at[base] === xi &&
			this.at[base + 1] === yi &&
			this.at[base + 2] === zi
		)
			return;
		// **A change of seed empties the whole thing**, because every slot was
		// hashed with the old one. It happens once, when a generator is built.
		if (this.seed !== seed) {
			this.ready.fill(0);
			this.seed = seed;
		}
		this.at[base] = xi;
		this.at[base + 1] = yi;
		this.at[base + 2] = zi;
		this.ready[slot] = 1;
		const into = slot * 8;
		for (let c = 0; c < 8; c++)
			this.held[into + c] = hash3(
				xi + (c & 1),
				yi + ((c >> 1) & 1),
				zi + (c >> 2),
				seed,
			);
	}
}
