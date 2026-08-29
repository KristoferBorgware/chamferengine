import type { LandformGrid } from "./LandformGrid.js";
import { CONT_EDGES, ERO_EDGES, PV_EDGES } from "./LandformGrid.js";
import { SHORE } from "./Landform.js";
import { bucket } from "./bucket.js";
import { gridAt } from "./gridAt.js";

/**
 * How many of the six points around a low cell must be low land as well
 * before it counts as a beach.
 *
 * Measured over a bench patch: at two the shore stops speckling -- runs of one
 * biome fall from 24 to 15 and none of the singles left is a shore. One leaves
 * eight; three starts taking the beaches that are real.
 */
export const SHORE_ROOM = 2;

/**
 * The landform at one place: `-1` in the sea, `SHORE` on the first few metres
 * of land that have room to be a beach, and whatever the grid says everywhere
 * else.
 *
 * **The shore is a height, not a bucket of continentalness.** Sea level is a
 * radius and every height is measured from it, so *the ground has barely come
 * out of the water* is one comparison, and it cannot be true on a mountain
 * however close to the coast it stands.
 *
 * **Low is necessary and not sufficient**, which is what `room` carries: the
 * foot of a cliff is low ground with the sea on one side and a hillside on
 * the other, and it is not a beach. The count comes from the room rule, which
 * asks six points a fixed distance out.
 */
export function landformAt(
	level: number,
	cut: number,
	swing: number,
	metres: number,
	room: number,
	shoreHeight: number,
	grid: LandformGrid,
): number {
	if (metres <= 0) return -1;
	if (metres <= shoreHeight && room >= SHORE_ROOM) return SHORE;
	return Number(
		grid[
			gridAt(
				bucket(level, CONT_EDGES),
				bucket(cut, ERO_EDGES),
				bucket(swing, PV_EDGES),
			)
		],
	);
}
