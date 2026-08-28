import type { Stand } from "./growStand.js";
import { isPlantLeaf, isPlantWood } from "./PLANT_BLOCKS.js";

/**
 * How much of the land a player could still step onto, `0` to `1`.
 *
 * **Collision is not a second system.** A plant is blocks, so what a player
 * walks into is the block test the world already runs, and whether a leaf stops
 * them is a property of the block type the way water's is. This counts what
 * that comes to: a column is blocked when anything solid stands in the knee
 * height above its own ground.
 */
export function standWalkable(
	stand: Stand,
	height: Float64Array,
	blockMetres: number,
	seaLevel: number,
	leavesCollide: boolean,
): number {
	const { blocks, layers, sunk } = stand;
	const knee = Math.max(1, Math.round(1 / blockMetres));
	let land = 0;
	let blocked = 0;
	const count = blocks.length / layers;
	for (let c = 0; c < count; c++) {
		if (height[c]! <= seaLevel) continue;
		land++;
		for (let up = 0; up < knee; up++) {
			const what = blocks[c * layers + sunk + up]!;
			if (isPlantWood(what) || (isPlantLeaf(what) && leavesCollide)) {
				blocked++;
				break;
			}
		}
	}
	return land ? 1 - blocked / land : 1;
}
