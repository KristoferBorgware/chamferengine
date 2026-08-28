import type { CellRef } from "chamfer/edit";
import type { PlantCells } from "chamfer/mesh";
import { rank, splitPath } from "chamfer/addressing";

/**
 * The plant blocks of every chunk that is drawn at full detail.
 *
 * **A plant is a block like any other, and everything that asks what is
 * somewhere has to get the same answer.** Terrain never crosses back from a
 * worker because anything can re-derive it from the address; a plant cannot be
 * re-derived cheaply -- it comes out of a walk over every root within reach of
 * a chunk's rim -- so the cells the worker wrote come back with the mesh and
 * live here.
 *
 * Only chunks at the finest level are held: a player reaches six blocks and
 * stands in one chunk, so what has to answer a collision is under their feet.
 *
 * A chunk's cells are one sorted array, searched rather than scanned. At the
 * shipped world a 64 m chunk holds about eighteen thousand of them, which is
 * 110 KB against the 210 KB of geometry already crossing for the same chunk.
 */
export class PlantCellStore {
	private readonly held = new Map<number, PlantCells>();
	private readonly depth: number;
	private readonly chunkLevel: number;
	private readonly layerCount: number;

	constructor(depth: number, chunkLevel: number, layerCount: number) {
		this.depth = depth;
		this.chunkLevel = chunkLevel;
		this.layerCount = layerCount;
	}

	/** Keep what one chunk grew, replacing whatever it had. */
	put(key: number, cells: PlantCells | undefined): void {
		if (cells && cells.where.length > 0) this.held.set(key, cells);
		else this.held.delete(key);
	}

	/** Drop a chunk nobody is drawing any more. */
	drop(key: number): void {
		this.held.delete(key);
	}

	forget(): void {
		this.held.clear();
	}

	/** How many chunks are held, for the readout. */
	get size(): number {
		return this.held.size;
	}

	/**
	 * What a plant put in one cell, or `0` for nothing.
	 *
	 * **The chunk the cell belongs to, at the world's own cut.** A cell on a
	 * border sits in more than one triangle and every one of them generated a
	 * slot for it, so any of them answers the same -- this takes the one the
	 * descent names, which is the same one the store and the mesher use.
	 */
	at(cell: CellRef): number {
		if (this.held.size === 0) return 0;
		const split = splitPath(cell.i, cell.j, this.depth, this.chunkLevel);
		let key = 0;
		for (const digit of split.path) key = key * 4 + digit;
		key += cell.face * 4 ** this.chunkLevel;
		const cells = this.held.get(key);
		if (cells === undefined) return 0;
		const m = 1 << (this.depth - this.chunkLevel);
		const want = rank(split.q, split.r, m) * this.layerCount + cell.layer;
		const where = cells.where;
		let low = 0;
		let high = where.length - 1;
		while (low <= high) {
			const mid = (low + high) >> 1;
			const at = where[mid]!;
			if (at === want) return cells.what[mid]!;
			if (at < want) low = mid + 1;
			else high = mid - 1;
		}
		return 0;
	}
}
