import type { BlockState } from "./BlockState.js";
import type { CellRef } from "./CellRef.js";
import type { StoreHeader } from "./StoreHeader.js";
import { ChunkDeltas } from "./ChunkDeltas.js";
import { cellSlot } from "./cellSlot.js";
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

	constructor(header: StoreHeader, rows?: Iterable<[number, ChunkDeltas]>) {
		this.header = header;
		if (rows) for (const [key, row] of rows) this.rows.set(key, row);
	}

	get size(): number {
		return this.rows.size;
	}

	/**
	 * How many records are held, over every chunk.
	 *
	 * A cell on a chunk border is held by each chunk whose triangle contains
	 * it, so this counts records rather than cells.
	 */
	get count(): number {
		let total = 0;
		for (const row of this.rows.values()) total += row.size;
		return total;
	}

	/**
	 * Write what a cell holds now, and say which chunks have to be rebuilt.
	 *
	 * **Written into every chunk whose triangle contains the cell**, not only
	 * the one that owns it. A chunk generates the slots on its own rim so the
	 * mesher can decide whether to emit a face there without fetching a
	 * neighbour, and a border cell sits in two triangles -- 17% of a chunk's
	 * slots do. Writing to the owner alone leaves the others deciding from
	 * ground that has moved.
	 */
	write(cell: CellRef, state: BlockState): number[] {
		const holders = chunksHolding(
			cell,
			this.header.subdivisionDepth,
			this.header.chunkLevel,
		);
		for (const { chunkKey, slot } of holders) {
			let row = this.rows.get(chunkKey);
			if (!row) {
				row = new ChunkDeltas();
				this.rows.set(chunkKey, row);
			}
			row.set(slot, cell.layer, state);
		}
		return holders.map((holder) => holder.chunkKey);
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
