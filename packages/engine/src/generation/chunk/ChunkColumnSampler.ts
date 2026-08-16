import type { Chunk } from "./Chunk.js";
import type { Column } from "./Column.js";
import type { ColumnSampler } from "./ColumnSampler.js";
import type { TerrainGenerator } from "../terrain/TerrainGenerator.js";
import { columnBand } from "./columnBand.js";
import { rank } from "../../addressing/lattice/rank.js";
import { splitPath } from "../../addressing/lattice/splitPath.js";

/**
 * Blocks for one chunk and for the cells just outside it.
 *
 * A chunk generates every slot of its triangle, so a cell inside it is a view
 * into the array with nothing copied. A cell on the triangle's edge has
 * neighbours on the other side, and those are generated on demand: about 97
 * columns at the rim against 561 held, and the alternative is holding the
 * neighbouring chunks resident before this one can be meshed.
 *
 * Generating gives the same blocks the neighbour's own array holds, because
 * terrain is a pure function of the address.
 *
 * Every column is held, so a cell and each of its six neighbours scan for their
 * band once between them rather than seven times.
 */
export class ChunkColumnSampler implements ColumnSampler {
	private readonly chunk: Chunk;
	private readonly terrain: TerrainGenerator;
	private readonly held = new Map<number, Column>();
	private outside = 0;

	constructor(chunk: Chunk, terrain: TerrainGenerator) {
		this.chunk = chunk;
		this.terrain = terrain;
	}

	/** How many columns were generated rather than read from the chunk. */
	get generated(): number {
		return this.outside;
	}

	columnAt(face: number, i: number, j: number): Column {
		const key = (face * 65536 + i) * 65536 + j;
		const already = this.held.get(key);
		if (already) return already;

		const chunk = this.chunk;
		let blocks: Uint16Array | null = null;
		if (face === chunk.address.face) {
			const split = splitPath(i, j, chunk.depth, chunk.chunkLevel);
			let same = true;
			for (let level = 0; level < split.path.length; level++)
				if (split.path[level] !== chunk.address.path[level])
					same = false;
			if (same) {
				const base = rank(split.q, split.r, chunk.m) * chunk.layerCount;
				blocks = chunk.blocks.subarray(base, base + chunk.layerCount);
			}
		}

		if (!blocks) {
			const column = this.terrain.columnAt(face, i, j);
			blocks = new Uint16Array(chunk.layerCount);
			for (let layer = 0; layer < chunk.layerCount; layer++)
				blocks[layer] = this.terrain.blockAt(column, layer);
			this.outside++;
		}

		const made = columnBand(blocks);
		this.held.set(key, made);
		return made;
	}
}
