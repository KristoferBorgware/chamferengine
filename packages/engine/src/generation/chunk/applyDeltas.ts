import type { Chunk } from "./Chunk.js";
import type { ChunkRow } from "../../edit/ChunkRows.js";
import type { OutsideBlocks } from "./OutsideBlocks.js";
import { BlockType } from "../terrain/BlockType.js";
import { cellRepresentations } from "../../addressing/neighbours/cellRepresentations.js";
import { coarseCell } from "../../edit/coarseCell.js";
import { offsetIn } from "../../edit/offsetIn.js";
import { outsideKey } from "./OutsideBlocks.js";
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
 * **A row carries the chunk its slots were counted in**, which is not always
 * this one: a cell on a border belongs to one triangle and is read by two or
 * three, so a chunk is handed the owner's rows alongside its own.
 *
 * **A record is filed at the finest chunk level and read at any of them.** Its
 * slot is a rank inside a triangle whose side the chunk level sets, so a coarse
 * chunk decoding one against its own level reads a different cell entirely.
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
 *
 * **What lands outside the triangle is handed back rather than dropped.** A
 * chunk meshes the ring one step past its own rim and has no slot for it, so
 * those records come out as {@link OutsideBlocks} for the column sampler to
 * write over the columns it generates. Dropping them is what left a ridge of
 * untouched ground along every chunk edge and a tunnel with no wall.
 *
 * **A record names a cell under its owner's face, which is not always this
 * one.** A cell on a face edge has a name under each face meeting there, so
 * every record is matched through {@link cellRepresentations} rather than by
 * feeding foreign coordinates to `offsetIn` and hoping they do not path-match
 * this triangle by coincidence.
 */
export function applyDeltas(
	chunk: Chunk,
	rows: readonly ChunkRow[],
	fineDepth: number,
	lod: number,
): OutsideBlocks {
	const n = 1 << chunk.depth;
	const touched = new Set<number>();
	const placed = new Set<number>();
	const outside: OutsideBlocks = new Map();
	for (const row of rows)
		for (const [slot, layer, state] of row.deltas.records()) {
			const fine = slotCell(
				row.chunkKey,
				slot,
				layer,
				fineDepth,
				// **The level the record was filed at, not this chunk's.** A
				// slot is a rank inside a triangle whose side the chunk level
				// sets, and the store is filed at the finest one however
				// coarse the chunk reading it is. The two always sum to it.
				chunk.chunkLevel + lod,
			);
			const cell = lod === 0 ? fine : coarseCell(fine, fineDepth, lod);
			if (cell.layer >= chunk.layerCount) continue;

			// The deepest layer of the crust is the floor of the world and there is
			// nothing under it. A record naming it is refused here as well as at
			// the click, so the floor is a property of the world rather than of
			// whatever wrote the record.
			if (cell.layer === chunk.layerCount - 1) continue;

			const block = typeOf(state);
			const names = cellRepresentations(cell.face, n, cell.i, cell.j);
			const mine = names.find(
				(named) =>
					named.face === chunk.address.face &&
					offsetIn(chunk.address.path, named.i, named.j, chunk.depth),
			);
			if (!mine) {
				// One step past the rim: no slot here, so it goes to the
				// sampler instead -- under every name, because the mesher
				// reaches it through whichever one its ring walk produced.
				for (const named of names) {
					const key = outsideKey(named.face, named.i, named.j);
					let column = outside.get(key);
					if (!column) {
						column = new Map<number, number>();
						outside.set(key, column);
					}
					const already = column.get(cell.layer);
					if (
						already !== undefined &&
						already !== BlockType.AIR &&
						block === BlockType.AIR
					)
						continue;
					column.set(cell.layer, block);
				}
				continue;
			}
			const offset = offsetIn(
				chunk.address.path,
				mine.i,
				mine.j,
				chunk.depth,
			)!;

			const at =
				rank(offset.q, offset.r, chunk.m) * chunk.layerCount +
				cell.layer;
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
	return outside;
}
