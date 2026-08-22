import type { Chunk } from "./Chunk.js";
import type { ChunkDeltas } from "../../edit/ChunkDeltas.js";
import { BlockType } from "../terrain/BlockType.js";
import { coarseCell } from "../../edit/coarseCell.js";
import { offsetIn } from "../../edit/offsetIn.js";
import { rank } from "../../addressing/lattice/rank.js";
import { slotCell } from "../../edit/slotCell.js";
import { typeOf } from "../../edit/typeOf.js";

/**
 * Write a player's changes over a generated chunk.
 *
 * A chunk is generated from the seed and then patched. That is one rule with no
 * cases: the same records are written whether the chunk is being drawn for the
 * first time, rebuilt after a click, or built again at a different level of
 * detail.
 *
 * **A record names a cell of the full-depth world and a coarse chunk holds
 * fewer.** `4 ^ lod` cells across and `2 ^ lod` down arrive at one coarse cell,
 * so a placed block grows to fill the cell it lands in. Where several records
 * meet, **a placed block beats a broken one**: the coarse cell reads as air only
 * when every record inside it was a break, so a wall stays a wall at distance
 * and a one-block hole in a hillside closes up.
 *
 * The band each column carries is recomputed for the columns that changed. It
 * is the first layer that is not air and the last that is not opaque, and the
 * mesher reads it to decide which layers to look at.
 */
export function applyDeltas(
	chunk: Chunk,
	deltas: ChunkDeltas,
	fineDepth: number,
	lod: number,
): void {
	const touched = new Set<number>();
	const placed = new Set<number>();
	for (const [slot, layer, state] of deltas.records()) {
		const fine = slotCell(
			chunk.address.key,
			slot,
			layer,
			fineDepth,
			chunk.chunkLevel,
		);
		const cell = lod === 0 ? fine : coarseCell(fine, fineDepth, lod);
		if (cell.layer >= chunk.layerCount) continue;
		const offset = offsetIn(
			chunk.address.path,
			cell.i,
			cell.j,
			chunk.depth,
		);
		if (!offset) continue;

		const block = typeOf(state);
		const at =
			rank(offset.q, offset.r, chunk.m) * chunk.layerCount + cell.layer;
		if (block === BlockType.AIR && placed.has(at)) continue;
		if (block !== BlockType.AIR) placed.add(at);
		chunk.blocks[at] = block;
		touched.add(rank(offset.q, offset.r, chunk.m));
	}

	for (const slot of touched) {
		const base = slot * chunk.layerCount;
		let first = chunk.layerCount;
		let last = -1;
		for (let layer = 0; layer < chunk.layerCount; layer++) {
			const block = chunk.blocks[base + layer]!;
			if (block !== BlockType.AIR) {
				if (first === chunk.layerCount) first = layer;
			} else last = layer;
			if (block === BlockType.WATER) last = layer;
		}
		chunk.band[slot * 2] = first;
		chunk.band[slot * 2 + 1] = last;
	}
}
