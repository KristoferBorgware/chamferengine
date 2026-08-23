import type { BlockState } from "./BlockState.js";
import { LAYER_BITS } from "../addressing/index.js";

/**
 * The blocks a player changed inside one chunk.
 *
 * A record is `[slot][layer][state]`. The chunk it belongs to is the key this
 * is stored under, so nothing here repeats the face or the path — what varies
 * within a row is which cell inside the chunk, and what is there now.
 *
 * Two typed arrays rather than one: the slot and the layer share a `Uint32Array`
 * at 23 bits for the largest chunk the panel offers, and the state is 16 bits
 * of its own. Six bytes a record, against eight for a record naming a cell of
 * the whole planet.
 *
 * A slot is a rank inside a triangle whose side the chunk level sets, so these
 * numbers mean nothing without knowing which chunk level they were counted
 * against. {@link DeltaStore} carries that once, for every row it holds.
 *
 * One record per cell, last write wins. Breaking a block writes air explicitly:
 * *never touched* and *mined out* are different states, and only the record
 * says which.
 */
const LAYER_MASK = (1 << LAYER_BITS) - 1;

/**
 * The widest slot a record can name.
 *
 * A word holds the slot above the layer, so what is left of 32 bits is what a
 * chunk may be: 2,097,151 slots is a triangle 2,047 cells a side, against the
 * 64 the panel offers.
 */
const SLOT_MAX = (2 ** (32 - LAYER_BITS) - 1) >>> 0;

export class ChunkDeltas {
	/** `slot << 11 | layer`, one entry per record. */
	private where: Uint32Array;

	/** The packed block state, one entry per record. */
	private what: Uint16Array;

	private used = 0;

	/** Where each cell's record sits, so a rewrite replaces rather than appends. */
	private readonly at = new Map<number, number>();

	constructor(capacity = 16) {
		this.where = new Uint32Array(capacity);
		this.what = new Uint16Array(capacity);
	}

	get size(): number {
		return this.used;
	}

	get byteLength(): number {
		return this.used * 6;
	}

	/**
	 * Set what a cell holds now.
	 *
	 * **Out of range is refused rather than packed.** A record is a slot and a
	 * layer shifted into one word, so a negative layer or a slot past the
	 * field's width does not overflow into an error -- it lands on some other
	 * cell, and the record is indistinguishable from a real one from then on.
	 * A layer of `-1` packs as every bit set and reads back as slot 2,097,151
	 * of layer 2,047, which is a cell no chunk has: silently corrupt on disk,
	 * and thrown far away from whatever wrote it. This is a caller's mistake,
	 * so it says so where it is made.
	 */
	set(slot: number, layer: number, state: BlockState): void {
		if (!Number.isInteger(slot) || slot < 0 || slot > SLOT_MAX)
			throw new RangeError(`slot ${slot} is not a slot`);
		if (!Number.isInteger(layer) || layer < 0 || layer > LAYER_MASK)
			throw new RangeError(`layer ${layer} is not a layer`);
		const where = slot * (LAYER_MASK + 1) + layer;
		const already = this.at.get(where);
		if (already !== undefined) {
			this.what[already] = state;
			return;
		}
		if (this.used === this.where.length) this.grow();
		this.where[this.used] = where;
		this.what[this.used] = state;
		this.at.set(where, this.used);
		this.used++;
	}

	/** What a cell holds now, or `undefined` where nobody has touched it. */
	get(slot: number, layer: number): BlockState | undefined {
		const at = this.at.get((slot << LAYER_BITS) | layer);
		return at === undefined ? undefined : this.what[at];
	}

	/** Every record, in the order it was first written. */
	*records(): Generator<[slot: number, layer: number, state: BlockState]> {
		for (let r = 0; r < this.used; r++) {
			const where = this.where[r]!;
			yield [where >>> LAYER_BITS, where & LAYER_MASK, this.what[r]!];
		}
	}

	/**
	 * The two arrays, trimmed to what is used, for storing or for posting to a
	 * worker.
	 *
	 * Copies rather than subarrays: a structured clone of a view sends the whole
	 * backing buffer, which for a chunk one record into a 16-record array is
	 * most of a hundred bytes of nothing.
	 */
	pack(): { where: Uint32Array; what: Uint16Array } {
		return {
			where: this.where.slice(0, this.used),
			what: this.what.slice(0, this.used),
		};
	}

	/** Rebuild from what {@link pack} produced. */
	static unpack(where: Uint32Array, what: Uint16Array): ChunkDeltas {
		const out = new ChunkDeltas(Math.max(1, where.length));
		for (let r = 0; r < where.length; r++)
			out.set(where[r]! >>> LAYER_BITS, where[r]! & LAYER_MASK, what[r]!);
		return out;
	}

	private grow(): void {
		const where = new Uint32Array(this.where.length * 2);
		const what = new Uint16Array(this.what.length * 2);
		where.set(this.where);
		what.set(this.what);
		this.where = where;
		this.what = what;
	}
}
