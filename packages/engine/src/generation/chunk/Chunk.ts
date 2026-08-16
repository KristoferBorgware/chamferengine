import type { ChunkAddress } from "./ChunkAddress.js";
import { BlockType } from "../terrain/BlockType.js";
import { chunkSlots } from "../../addressing/lattice/chunkSlots.js";
import { rank } from "../../addressing/lattice/rank.js";

/**
 * One triangle's worth of blocks, as a single typed array.
 *
 * Every chunk reserves the same `(m+1)(m+2)/2` slots — 561 at depth 11 and
 * chunk level 6 — so a cell is `rank(q, r) * layerCount + layer` with no
 * per-chunk table to consult. `(3m + 2) / 2` of those slots hold cells a
 * neighbouring chunk owns: 49 of 561, 8.7%, and generating them anyway lets
 * the mesher read a chunk's own border without fetching a neighbour.
 *
 * At 435 layers a chunk is 244,035 cells and 488 KB. Crust depth multiplies
 * that linearly.
 */
export class Chunk {
	readonly address: ChunkAddress;
	readonly depth: number;
	readonly chunkLevel: number;

	/** The chunk triangle's side, in lattice steps. */
	readonly m: number;

	readonly slots: number;
	readonly layerCount: number;

	/** One block type per cell, `rank(q, r) * layerCount + layer`. */
	readonly blocks: Uint16Array;

	/**
	 * The first layer holding ground, per slot.
	 *
	 * The mesher walks down from here rather than from layer 0, which skips the
	 * empty sky above every column.
	 */
	readonly groundLayer: Uint16Array;

	constructor(
		address: ChunkAddress,
		depth: number,
		chunkLevel: number,
		layerCount: number,
		blocks?: Uint16Array,
		groundLayer?: Uint16Array,
	) {
		this.address = address;
		this.depth = depth;
		this.chunkLevel = chunkLevel;
		this.m = 1 << (depth - chunkLevel);
		this.slots = chunkSlots(this.m);
		this.layerCount = layerCount;
		this.blocks = blocks ?? new Uint16Array(this.slots * layerCount);
		this.groundLayer = groundLayer ?? new Uint16Array(this.slots);
	}

	/** Where a cell sits in {@link blocks}. */
	indexOf(q: number, r: number, layer: number): number {
		return rank(q, r, this.m) * this.layerCount + layer;
	}

	blockAt(q: number, r: number, layer: number): BlockType {
		return this.blocks[this.indexOf(q, r, layer)] as BlockType;
	}

	/** How many bytes the chunk holds, for a residency budget. */
	get byteLength(): number {
		return this.blocks.byteLength + this.groundLayer.byteLength;
	}
}
