import type { ChunkAddress } from "./ChunkAddress.js";
import type { Column } from "./Column.js";
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
	 * The band of each slot, as two entries per slot: the first layer that is
	 * not air, and the last that is not opaque.
	 *
	 * Reading them off the blocks afterwards costs a walk down every column of
	 * the chunk and every column around it, which is the whole crust scanned to
	 * find a handful of layers. Generation walks each column once already, so it
	 * writes the band as it goes and the scan disappears.
	 */
	readonly band: Int16Array;

	/**
	 * Each slot's true surface radii, ground then water, before the rounding
	 * to this chunk's own layer grid. Zeros where nothing recorded them.
	 *
	 * A radius is a world position, so it is held at `float64` however small
	 * the number looks. The cells around a chunk are generated on demand and
	 * arrive at full precision, and the rounding that turns a radius into a
	 * layer is a `ceil`: two readings of one surface that differ by a
	 * `float32` step at planet radius -- 0.49 mm at 6,800 m -- land on
	 * different layers whenever the surface sits on a layer boundary, and a
	 * whole block of cliff stands between them.
	 */
	readonly surface: Float64Array;

	constructor(
		address: ChunkAddress,
		depth: number,
		chunkLevel: number,
		layerCount: number,
		blocks?: Uint16Array,
		band?: Int16Array,
		surface?: Float64Array,
	) {
		this.address = address;
		this.depth = depth;
		this.chunkLevel = chunkLevel;
		this.m = 1 << (depth - chunkLevel);
		this.slots = chunkSlots(this.m);
		this.layerCount = layerCount;
		this.blocks = blocks ?? new Uint16Array(this.slots * layerCount);
		this.band = band ?? new Int16Array(this.slots * 2);
		this.surface = surface ?? new Float64Array(this.slots * 2);
	}

	/** The column at a slot, as the mesher reads it. */
	columnOf(slot: number): Column {
		const base = slot * this.layerCount;
		return {
			blocks: this.blocks.subarray(base, base + this.layerCount),
			first: this.band[slot * 2]!,
			last: this.band[slot * 2 + 1]!,
			groundRadius: this.surface[slot * 2]!,
			waterRadius: this.surface[slot * 2 + 1]!,
		};
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
		return (
			this.blocks.byteLength +
			this.band.byteLength +
			this.surface.byteLength
		);
	}
}
