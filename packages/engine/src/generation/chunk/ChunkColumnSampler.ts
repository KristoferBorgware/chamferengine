import type { Chunk } from "./Chunk.js";
import type { Column } from "./Column.js";
import type { ColumnSampler } from "./ColumnSampler.js";
import type { OutsideBlocks } from "./OutsideBlocks.js";
import type { TerrainGenerator } from "../terrain/TerrainGenerator.js";
import { BlockType } from "../terrain/BlockType.js";
import { cellRepresentations } from "../../addressing/neighbours/cellRepresentations.js";
import { offsetIn } from "../../edit/offsetIn.js";
import { outsideKey } from "./OutsideBlocks.js";
import { rank } from "../../addressing/lattice/rank.js";

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
 *
 * **HOLDING A CELL AND OWNING IT ARE DIFFERENT QUESTIONS, AND THIS ASKS THE
 * FIRST.** A cell on a chunk border sits in two or three triangles; the border
 * rule awards it to the lowest key, and that decides only **who draws it**. A
 * chunk generates and patches a slot for every cell of its own triangle,
 * owned or not, which is the whole reason it can mesh its rim without fetching
 * a neighbour. Asking the ownership question here -- `splitPath`, the descent
 * that picks the winner -- makes a chunk regenerate its own rim from the seed
 * while holding a patched slot for it three lines away: **33 of 153 cells** at
 * depth 8 cut at chunk level 4, which is the entire rim. Every edit on a seam
 * was written into the array and then read back from the seed, so a broken
 * block kept its cap and a rim cell asking whether to draw a wall was told
 * there was rock where the tunnel was. {@link offsetIn} is the containment
 * question and is what belongs here.
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
		const mine = this.slotOf(face, i, j);
		if (mine !== null) made = chunk.columnOf(mine);

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

	/**
	 * This chunk's own slot for a cell, or `null` where it holds none.
	 *
	 * **Containment, not ownership**: every cell of the triangle has a slot
	 * here, including the border cells a neighbour draws.
	 *
	 * A cell on an icosahedron face edge has a name under each face meeting
	 * there and the mesher's ring walk reaches it under whichever one it
	 * produced, so a name on another face is translated before being refused.
	 * The translation only runs when the cell is actually on a face edge --
	 * a lattice weight of zero -- which is the only case that has a second
	 * name at all.
	 */
	private slotOf(face: number, i: number, j: number): number | null {
		const chunk = this.chunk;
		if (face === chunk.address.face) {
			const at = offsetIn(chunk.address.path, i, j, chunk.depth);
			return at ? rank(at.q, at.r, chunk.m) : null;
		}
		for (const named of cellRepresentations(face, 1 << chunk.depth, i, j)) {
			if (named.face !== chunk.address.face) continue;
			const at = offsetIn(
				chunk.address.path,
				named.i,
				named.j,
				chunk.depth,
			);
			if (at) return rank(at.q, at.r, chunk.m);
		}
		return null;
	}
}
