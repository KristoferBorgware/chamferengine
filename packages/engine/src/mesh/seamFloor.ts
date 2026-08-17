import type { TerrainGenerator } from "../generation/terrain/TerrainGenerator.js";
import { latticePosition } from "../addressing/lattice/latticePosition.js";
import { positionToCell } from "../addressing/lookup/positionToCell.js";

/**
 * The lowest surface a neighbouring level might put beside a rim column.
 *
 * On relief, two levels put a cliff's edge at horizontally different places,
 * so their surfaces disagree by the whole cliff height where it crosses a
 * chunk boundary — far past any fixed skirt depth. A chunk does not know
 * which level its neighbour is drawn at, but the levels it can be are the
 * bracket around its own, and the terrain is a pure function of position: one
 * column evaluation per bracketing level says how far down the join can
 * open, and the skirt reaches it. Walls only ever go downward from a chunk's
 * own surface, so against a neighbour at the same level the deeper reach is
 * buried and nothing ever stands into the air.
 *
 * Returns `Infinity` with no brackets, which a caller treats as "the fixed
 * depth is enough".
 */
export function seamFloor(
	n: number,
	brackets: readonly TerrainGenerator[],
): (face: number, i: number, j: number) => number {
	return (face, i, j) => {
		const direction = latticePosition(face, n, i, j);
		let floor = Infinity;
		for (const terrain of brackets) {
			const cell = positionToCell(direction, terrain.shape.n);
			const column = terrain.columnAt(cell.face, cell.i, cell.j);
			if (column.groundRadius < floor) floor = column.groundRadius;
		}
		return floor;
	};
}
