import type { BlockProbe } from "chamfer/player";
import type { CellRef, DeltaStore } from "chamfer/edit";
import type { TerrainGenerator } from "chamfer/generation";
import type { WorldShape } from "chamfer/world";
import { BlockType } from "chamfer/generation";
import { Vec3 } from "chamfer/math";
import { positionToCell } from "chamfer/addressing";
import { typeOf } from "chamfer/edit";

/** What the world is made of, by cell and by point in space. */
export interface WorldBlocks {
	/** The block in one cell: what a player changed there, or what the seed made. */
	blockAt(cell: CellRef): BlockType;

	/** The same answer for a point in space, which is what a player asks. */
	readonly probe: BlockProbe;
}

/**
 * One answer to "what is here", for everything that asks.
 *
 * **The seed is not the world.** Terrain is a pure function of the address and
 * a player's changes are not, so anything reading the generator directly is
 * reading the world as it was before anybody touched it. That is fine for the
 * mesher's own generation step, which is patched afterwards, and wrong for
 * every live question -- and the player's collision probe was the generator.
 * Standing on ground you had just mined out, walking through a block you had
 * just placed, and being stopped by rock in a tunnel you had just dug are all
 * that one wire.
 *
 * Collision, floating and whether the camera is under water are the same
 * question, so all three come through here.
 *
 * The store is taken as a function rather than a value because it is replaced
 * when a saved world finishes loading, and a probe holding the empty one would
 * answer from the seed forever.
 */
export function worldBlocks(
	terrain: TerrainGenerator,
	shape: WorldShape,
	edits: () => DeltaStore,
): WorldBlocks {
	const blockAt = (cell: CellRef): BlockType => {
		if (cell.layer < 0 || cell.layer >= shape.crustDepth)
			return BlockType.AIR;
		// The floor of the world, before anything a record could say about it.
		if (cell.layer === shape.crustDepth - 1) return BlockType.BEDROCK;
		const changed = edits().read(cell);
		if (changed !== undefined) return typeOf(changed) as BlockType;
		const column = terrain.columnAt(cell.face, cell.i, cell.j);
		return terrain.blockAt(column, cell.layer);
	};

	return {
		blockAt,
		probe: {
			blockAtPosition(position): BlockType {
				const at = new Vec3(position.x, position.y, position.z);
				const cell = positionToCell(at, shape.n);
				return blockAt({
					...cell,
					layer: shape.layerOfRadius(at.length()),
				});
			},
		},
	};
}
