import type { BlockState } from "./BlockState.js";
import type { CellRef } from "./CellRef.js";
import type { ChunkRow } from "./ChunkRows.js";
import type { StoreHeader } from "./StoreHeader.js";
import { ChunkDeltas } from "./ChunkDeltas.js";
import { cellSlot } from "./cellSlot.js";
import { chunksReading } from "./chunksReading.js";
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
			for (const [slot, layer] of row.records())
				this.note(
					slotCell(
						key,
						slot,
						layer,
						header.subdivisionDepth,
						header.chunkLevel,
					),
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
		return this.note(cell, chunkKey);
	}

	/**
	 * Record what a written cell means for the chunks around it, and return
	 * every chunk that reads it.
	 */
	private note(cell: CellRef, owner: number): number[] {
		// **Reading, not holding.** A chunk meshes the ring one step past its
		// own rim, and those cells sit inside the neighbour's triangle -- so
		// the set that has to be told is wider than the set that stores it.
		const keys = chunksReading(
			cell,
			this.header.subdivisionDepth,
			this.header.chunkLevel,
		);
		for (const chunkKey of keys) {
			if (chunkKey === owner) continue;
			let also = this.alsoReads.get(chunkKey);
			if (!also) {
				also = new Set<number>();
				this.alsoReads.set(chunkKey, also);
			}
			also.add(owner);
		}
		// Every reader, not just the owner. A chunk's apron draws the ring
		// past its rim, so a shaft dug just across the boundary is geometry
		// this chunk puts on the screen and its cull volume has to hold.
		for (const chunkKey of keys) this.stretch(chunkKey, cell.layer);
		return keys;
	}

	/** Widen a chunk's reach to hold a changed block's layer. */
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
	 * The shallowest and deepest layer a change reaches in a chunk.
	 *
	 * The chunk selection decides what to draw from how high the ground stands
	 * under each triangle, and it reads that from a picture of the generated
	 * world, which holds no change anybody made. This is what a chunk has that
	 * the picture does not.
	 *
	 * **Breaking counts, and it is the half that reaches furthest.** A tower
	 * pokes out of the top of the volume built for its hillside; a shaft goes
	 * out of the bottom of it, and a shaft can be the whole crust deep where a
	 * tower is a few blocks tall. The walls of a hole are geometry standing
	 * where the picture of the generated world says there is solid ground, so
	 * a volume that stops at the surface culls a player standing at the bottom
	 * of their own mine and leaves them in an empty room.
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
