import type { BlockState } from "./BlockState.js";
import type { CellRef } from "./CellRef.js";
import type { ChunkRow } from "./ChunkRows.js";
import type { StoreHeader } from "./StoreHeader.js";
import { ChunkDeltas } from "./ChunkDeltas.js";
import { cellSlot } from "./cellSlot.js";
import { typeOf } from "./typeOf.js";
import { chunksHolding } from "./chunksHolding.js";
import { slotCell } from "./slotCell.js";

/**
 * Every block a player has changed on one planet, one row per chunk.
 *
 * A chunk's records are wanted at exactly the moment that chunk is built, so
 * the row and the load unit are the same triangle: one read when a chunk is
 * meshed, one write when it changes.
 *
 * The header travels with the rows. Its subdivision depth and chunk level are
 * what turn a record's slot back into a cell, and {@link recut} converts every
 * row when the chunk level moves.
 */
export class DeltaStore {
	readonly header: StoreHeader;

	private readonly rows = new Map<number, ChunkDeltas>();

	/**
	 * For each chunk, the other chunks whose records it also has to read.
	 *
	 * A chunk generates the slots on its own rim so the mesher can decide
	 * whether to emit a face there without fetching a neighbour, and a cell on
	 * a border sits in two triangles -- 17% of a chunk's slots do. Only one of
	 * them owns the cell and holds the record; the others are listed here, so a
	 * chunk being built is handed exactly the rows it reads.
	 *
	 * Built as changes are written, which happens about twice a second, and
	 * rebuilt from the records when a store is loaded.
	 */
	private readonly alsoReads = new Map<number, Set<number>>();

	/** The highest and lowest layer a placed block reaches, per chunk. */
	private readonly reach = new Map<number, { top: number; bottom: number }>();

	constructor(header: StoreHeader, rows?: Iterable<[number, ChunkDeltas]>) {
		this.header = header;
		if (!rows) return;
		for (const [key, row] of rows) this.rows.set(key, row);
		// A loaded store carries records and nothing derived from them.
		for (const [key, row] of this.rows)
			for (const [slot, layer, state] of row.records())
				this.note(
					slotCell(
						key,
						slot,
						layer,
						header.subdivisionDepth,
						header.chunkLevel,
					),
					state,
					key,
				);
	}

	get size(): number {
		return this.rows.size;
	}

	/** How many cells have been changed, over every chunk. */
	get count(): number {
		let total = 0;
		for (const row of this.rows.values()) total += row.size;
		return total;
	}

	/**
	 * Write what a cell holds now, and say which chunks have to be rebuilt.
	 *
	 * **One record, in the chunk that owns the cell.** The chunks that only
	 * read it are noted instead, and handed the owner's row when they are
	 * built. Storing a copy in each would keep them in step only for as long as
	 * one writer exists; a second one, or two players editing the same seam,
	 * would have to keep the copies in step by hand.
	 *
	 * Every chunk that reads the cell is returned, because all of them draw
	 * from ground that has just moved.
	 */
	write(cell: CellRef, state: BlockState): number[] {
		const { chunkKey, slot } = cellSlot(
			cell,
			this.header.subdivisionDepth,
			this.header.chunkLevel,
		);
		let row = this.rows.get(chunkKey);
		if (!row) {
			row = new ChunkDeltas();
			this.rows.set(chunkKey, row);
		}
		row.set(slot, cell.layer, state);
		return this.note(cell, state, chunkKey);
	}

	/**
	 * Record what a written cell means for the chunks around it, and return
	 * every chunk that reads it.
	 */
	private note(cell: CellRef, state: BlockState, owner: number): number[] {
		const holders = chunksHolding(
			cell,
			this.header.subdivisionDepth,
			this.header.chunkLevel,
		);
		const keys: number[] = [];
		for (const { chunkKey } of holders) {
			keys.push(chunkKey);
			if (chunkKey === owner) continue;
			let also = this.alsoReads.get(chunkKey);
			if (!also) {
				also = new Set<number>();
				this.alsoReads.set(chunkKey, also);
			}
			also.add(owner);
		}
		if (typeOf(state) !== 0) this.stretch(owner, cell.layer);
		return keys;
	}

	/** Widen a chunk's reach to hold a placed block's layer. */
	private stretch(chunkKey: number, layer: number): void {
		const already = this.reach.get(chunkKey);
		if (!already) {
			this.reach.set(chunkKey, { top: layer, bottom: layer });
			return;
		}
		if (layer < already.top) already.top = layer;
		if (layer > already.bottom) already.bottom = layer;
	}

	/**
	 * The shallowest and deepest layer a placed block reaches in a chunk.
	 *
	 * The chunk selection decides what to draw from how high the ground stands
	 * under each triangle, and it reads that from a picture of the generated
	 * world, which holds no placed block. This is what a chunk has that the
	 * picture does not. Broken blocks are left out: taking ground away never
	 * puts geometry outside the volume the ground already had.
	 */
	reachOf(chunkKey: number): { top: number; bottom: number } | undefined {
		return this.reach.get(chunkKey);
	}

	/** Every chunk that has either records of its own or a neighbour's to read. */
	touched(): number[] {
		return [...new Set([...this.rows.keys(), ...this.alsoReads.keys()])];
	}

	/**
	 * The rows a chunk has to read: its own, and those of the chunks holding
	 * cells inside its triangle.
	 */
	rowsFor(chunkKey: number): ChunkRow[] {
		const out: ChunkRow[] = [];
		const own = this.rows.get(chunkKey);
		if (own) out.push({ chunkKey, deltas: own });
		for (const other of this.alsoReads.get(chunkKey) ?? []) {
			const row = this.rows.get(other);
			if (row) out.push({ chunkKey: other, deltas: row });
		}
		return out;
	}

	/** What a cell holds now, or `undefined` where nobody has touched it. */
	read(cell: CellRef): BlockState | undefined {
		const { chunkKey, slot } = cellSlot(
			cell,
			this.header.subdivisionDepth,
			this.header.chunkLevel,
		);
		return this.rows.get(chunkKey)?.get(slot, cell.layer);
	}

	/** One chunk's records, or `undefined` where it holds none. */
	rowOf(chunkKey: number): ChunkDeltas | undefined {
		return this.rows.get(chunkKey);
	}

	entries(): IterableIterator<[number, ChunkDeltas]> {
		return this.rows.entries();
	}

	/**
	 * The same edits, re-filed under a different chunk level.
	 *
	 * Every record is read back to the cell it names through this store's own
	 * header, then cut again at the new level. Both the row it lands in and the
	 * slot inside change, and nothing is lost: the header supplied what the
	 * record alone could not say.
	 */
	recut(chunkLevel: number): DeltaStore {
		if (chunkLevel === this.header.chunkLevel) return this;
		const out = new DeltaStore({ ...this.header, chunkLevel });
		const { subdivisionDepth, chunkLevel: was } = this.header;
		for (const [chunkKey, row] of this.rows)
			for (const [slot, layer, state] of row.records())
				out.write(
					slotCell(chunkKey, slot, layer, subdivisionDepth, was),
					state,
				);
		return out;
	}
}
