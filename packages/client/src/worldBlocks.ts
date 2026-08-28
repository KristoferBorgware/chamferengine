import type { BlockProbe } from "chamfer/player";
import type { CellRef, DeltaStore } from "chamfer/edit";
import type { PlantCellStore } from "./PlantCellStore.js";
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
 * **A plant is a block like any other**, and the seed does not know about the
 * trees: one comes out of a walk over every root within reach of a chunk's
 * rim, not out of the column being asked about. So the cells a chunk's plants
 * wrote come back with its mesh, and are read here between the record of what
 * a player changed and what the seed made -- a broken branch stays broken, and
 * an unbroken one stops you.
 *
 * **Everything is taken as a function, because everything here is replaced.**
 * The store is replaced when a saved world finishes loading; the generator and
 * the shape are replaced whenever a terrain knob rebuilds the world. A probe
 * holding any of them by value keeps answering for a world that no longer
 * exists -- the empty store answers from the seed forever, and the old
 * generator answers for the planet before the knob moved.
 */
export function worldBlocks(
	terrain: () => TerrainGenerator,
	shape: () => WorldShape,
	edits: () => DeltaStore,
	plants: () => PlantCellStore | null,
): WorldBlocks {
	const blockAt = (cell: CellRef): BlockType => {
		const world = shape();
		if (cell.layer < 0 || cell.layer >= world.crustDepth)
			return BlockType.AIR;
		// The floor of the world, before anything a record could say about it.
		if (cell.layer === world.crustDepth - 1) return BlockType.BEDROCK;
		const changed = edits().read(cell);
		if (changed !== undefined) return typeOf(changed) as BlockType;
		// **Before the seed and after the record.** A plant stands in air the
		// seed left empty, so it can only ever fill a cell the generator would
		// call air -- and a record of somebody breaking it has already been
		// read above.
		const grown = plants()?.at(cell) ?? 0;
		if (grown !== 0) return grown as BlockType;
		const ground = terrain();
		const column = ground.columnAt(cell.face, cell.i, cell.j);
		return ground.blockAt(column, cell.layer);
	};

	return {
		blockAt,
		probe: {
			blockAtPosition(position): BlockType {
				const world = shape();
				const at = new Vec3(position.x, position.y, position.z);
				const cell = positionToCell(at, world.n);
				return blockAt({
					...cell,
					layer: world.layerOfRadius(at.length()),
				});
			},
		},
	};
}
