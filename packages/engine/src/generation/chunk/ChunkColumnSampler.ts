import type { Chunk } from "./Chunk.js";
import type { Column } from "./Column.js";
import type { ColumnSampler } from "./ColumnSampler.js";
import type { OutsideBlocks } from "./OutsideBlocks.js";
import type { TerrainGenerator } from "../terrain/TerrainGenerator.js";
import { BlockType } from "../terrain/BlockType.js";
import { outsideKey } from "./OutsideBlocks.js";
import { rank } from "../../addressing/lattice/rank.js";
import { splitPath } from "../../addressing/lattice/splitPath.js";

/**
 * Blocks for one chunk and for the cells just outside it.
 *
 * A chunk generates every slot of its triangle and records each column's band
 * as it writes it, so a cell inside is a view into the array with nothing
 * copied and nothing scanned. A cell on the triangle's edge has neighbours on
 * the other side, and those are generated on demand: about 97 columns at the
 * rim against 561 held, and the alternative is holding the neighbouring chunks
 * resident before this one can be meshed.
 *
 * Generating gives the same blocks the neighbour's own array holds -- **as long
 * as the changes are written over it too**. Terrain is a pure function of the
 * address and a player's edits are not, so a generated column is the seed's
 * answer and the neighbour's array is the seed's answer patched. Handing this
 * the records that landed outside the triangle is what keeps the two the same
 * column: without it the apron drew ground somebody had already dug away, and a
 * rim cell asking whether to draw a wall was told there was rock where there
 * was a tunnel.
 */
export class ChunkColumnSampler implements ColumnSampler {
	private readonly chunk: Chunk;
	private readonly terrain: TerrainGenerator;
	private readonly changed: OutsideBlocks | null;
	private readonly held = new Map<number, Column>();
	private outside = 0;

	constructor(
		chunk: Chunk,
		terrain: TerrainGenerator,
		changed: OutsideBlocks | null = null,
	) {
		this.chunk = chunk;
		this.terrain = terrain;
		this.changed = changed?.size ? changed : null;
	}

	/** How many columns were generated rather than read from the chunk. */
	get generated(): number {
		return this.outside;
	}

	columnAt(face: number, i: number, j: number): Column {
		const key = outsideKey(face, i, j);
		const already = this.held.get(key);
		if (already) return already;

		const chunk = this.chunk;
		let made: Column | null = null;
		if (face === chunk.address.face) {
			const split = splitPath(i, j, chunk.depth, chunk.chunkLevel);
			let same = true;
			for (let level = 0; level < split.path.length; level++)
				if (split.path[level] !== chunk.address.path[level])
					same = false;
			if (same) made = chunk.columnOf(rank(split.q, split.r, chunk.m));
		}

		if (!made) {
			const blocks = new Uint16Array(chunk.layerCount);
			const column = this.terrain.columnAt(face, i, j);
			const band = this.terrain.fillColumn(
				column,
				blocks,
				0,
				chunk.layerCount,
			);
			let { first, last } = band;
			const written = this.changed?.get(outsideKey(face, i, j));
			if (written) {
				for (const [layer, block] of written)
					if (layer >= 0 && layer < chunk.layerCount)
						blocks[layer] = block;
				// The band is what the mesher walks, so it has to be
				// recomputed rather than kept: a block placed above the ground
				// widens it upward and a hole dug under it widens it down.
				// Same rule as the chunk's own columns get.
				first = chunk.layerCount;
				last = -1;
				for (let layer = 0; layer < chunk.layerCount; layer++) {
					const block = blocks[layer]!;
					if (block !== BlockType.AIR) {
						if (first === chunk.layerCount) first = layer;
					} else last = layer;
					if (block === BlockType.WATER) last = layer;
				}
			}
			made = {
				blocks,
				first,
				last,
				groundRadius: column.groundRadius,
				waterRadius: column.waterRadius,
			};
			this.outside++;
		}

		this.held.set(key, made);
		return made;
	}
}
