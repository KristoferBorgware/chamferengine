import type { CoarseGrid } from "./CoarseGrid.js";
import type { ErosionOptions } from "./ErosionOptions.js";
import { DROPLET } from "./DROPLET.js";
import { hash3 } from "../noise/hash3.js";

/**
 * Cut valleys into a height field by running water over it, cell to cell.
 *
 * A droplet starts on a hashed cell and walks downhill, taking the steepest
 * step it can find. How much it can carry depends on how fast it is going and
 * how steeply the ground falls; where it can carry more than it holds it cuts,
 * and where it slows or runs onto flat ground it puts material back down.
 * Thousands of droplets leave the ridges sharp, the valleys graded and the
 * flats silted.
 *
 * **No routing, no pits, no rivers.** A droplet only ever looks at the cell it
 * is standing on and the six around it, so nothing here needs the drainage
 * network computed first.
 *
 * **The direction is one of six, and the cut lands on one cell and its ring.**
 * On ground whose gradient is gentle and smooth the same neighbour keeps
 * winning, so the walk locks to a lattice axis; and half of each cut is taken
 * from the centre against a twelfth from each neighbour, which is a spike.
 * `erodeFreeDroplets` is the same water with a position between cells.
 *
 * Every draw is hashed from the seed and the droplet's number rather than taken
 * from a running generator, and droplets run one after another, so the result
 * does not depend on anything but the seed. Returns how many droplets the
 * strength implies, which is what a sliced caller needs to know.
 */
export function erodeDroplets(
	grid: CoarseGrid,
	height: Float64Array,
	seed: number,
	strength: number,
	cellMetres: number,
	options: ErosionOptions = {},
): number {
	const maxCut = options.maxCut ?? DROPLET.maxCut;
	const cutShare = options.cutShare ?? DROPLET.cutShare;
	const droplets = Math.round(strength * DROPLET.perCell * grid.count);
	if (droplets <= 0) return 0;
	const from = options.from ?? 0;
	const until = Math.min(droplets, from + (options.take ?? droplets));

	for (let drop = from; drop < until; drop++) {
		let cell = Math.min(
			grid.count - 1,
			Math.floor(hash3(drop & 0xffff, drop >>> 16, 0, seed) * grid.count),
		);
		let sediment = 0;
		let speed = 1;
		let water = 1;

		for (let step = 0; step < DROPLET.maxSteps; step++) {
			// The steepest of the six, which is where the water would actually
			// go. A pentagon has five and the ring says so.
			let next = -1;
			let fall = 0;
			for (let k = 0; k < 6; k++) {
				const other = grid.ring[cell * 6 + k]!;
				if (other < 0) continue;
				const down = height[cell]! - height[other]!;
				if (down > fall) {
					fall = down;
					next = other;
				}
			}

			// Nowhere lower: the droplet has reached a floor or the sea, and
			// everything it was carrying settles here.
			if (next < 0) {
				height[cell] = height[cell]! + sediment;
				break;
			}

			const gradient = Math.max(fall / cellMetres, DROPLET.minGradient);
			const capacity = gradient * speed * water * DROPLET.capacity;

			if (sediment > capacity) {
				const put = (sediment - capacity) * DROPLET.depositRate;
				sediment -= put;
				height[cell] = height[cell]! + put;
			} else {
				// Never cut deeper than the step being taken, or a droplet digs
				// a pit under itself and the next one falls into it.
				const cut = Math.min(
					(capacity - sediment) * DROPLET.erosionRate,
					fall * maxCut,
				);
				sediment += cut;
				// Spread most of it over the ring, so one cell does not become a
				// spike of its own. What the ring cannot take stays here.
				let taken = 0;
				let degree = 0;
				for (let k = 0; k < 6; k++)
					if (grid.ring[cell * 6 + k]! >= 0) degree++;
				const share = degree > 0 ? (cut * (1 - cutShare)) / degree : 0;
				for (let k = 0; k < 6; k++) {
					const other = grid.ring[cell * 6 + k]!;
					if (other < 0) continue;
					height[other] = height[other]! - share;
					taken += share;
				}
				height[cell] = height[cell]! - (cut - taken);
			}

			speed = Math.sqrt(
				Math.max(0, speed * speed + fall * DROPLET.gravity),
			);
			water *= 1 - DROPLET.evaporation;
			cell = next;
		}
	}
	return droplets;
}
