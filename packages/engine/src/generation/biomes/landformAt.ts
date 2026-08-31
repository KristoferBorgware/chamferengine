import type { LandformGrid } from "./LandformGrid.js";
import { CONT_EDGES, ERO_EDGES, PV_EDGES, RISE_EDGES } from "./LandformGrid.js";
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
 *
 * **The shore is the only rule left beside the grid.** How high the ground
 * stands is one of the grid's own four axes now (`rise`, a share of the
 * world's tallest ground), so a landform whose meaning includes height is
 * written down rather than corrected afterwards -- a peak is sharp *and*
 * high because the cell that names it is in the high sheet. The shore stays
 * outside because it is a rule about the sea rather than about the ground:
 * it needs the room count, which no reading of a curve carries.
 */
export function landformAt(
	level: number,
	cut: number,
	swing: number,
	rise: number,
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
				bucket(rise, RISE_EDGES),
				bucket(cut, ERO_EDGES),
				bucket(swing, PV_EDGES),
			)
		],
	);
}
