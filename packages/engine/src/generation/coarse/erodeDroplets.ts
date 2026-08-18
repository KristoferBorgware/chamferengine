import type { CoarseGrid } from "./CoarseGrid.js";
import { hash3 } from "../noise/hash3.js";

/** How many droplets one unit of the knob runs, per cell of the map. */
const DROPLETS_PER_CELL = 1.5;

/** How many cells a droplet may cross before it is abandoned. */
const MAX_STEPS = 48;

/**
 * How much a droplet may carry, as metres of height per unit of gradient.
 *
 * Capacity is a **gradient** times this, never a fall in metres times a cell
 * width -- that made a droplet crossing flat ground on a 100 m map want to
 * carry `15 m` of material, and cut it out. The gradient form means the same
 * hillside erodes by the same amount whatever the map's cell size is.
 */
const CAPACITY = 8;

/** A floor under the gradient, so a droplet on flat ground still carries. */
const MIN_GRADIENT = 0.01;

/** How much of the excess a slowing droplet puts down in one step. */
const DEPOSIT_RATE = 0.1;

/** How much of the shortfall a hungry droplet cuts out in one step. */
const EROSION_RATE = 0.05;

/**
 * The most of one step's fall a single droplet may cut, as a fraction.
 *
 * Without it a droplet meeting a tall step takes the whole thing at once and
 * leaves a pit for the next one to fall into. A cell is crossed by dozens of
 * droplets, so a tenth each is still a valley by the end -- and the shapes come
 * out graded rather than pocked. Uncapped, erosion **multiplied** the median
 * slope by four and the 90th percentile by seven, which is the opposite of
 * what water does to a hillside.
 */
const MAX_CUT = 0.1;

/** How much speed a droplet gains per metre of fall. */
const GRAVITY = 4;

/** What a cell keeps of the material cut from it; the rest goes to the ring. */
const CUT_SHARE = 0.5;

/** How much of a droplet's water is gone after one step. */
const EVAPORATION = 0.02;

/**
 * Cut valleys into a height field by running water over it.
 *
 * A droplet starts on a hashed cell and walks downhill, cell to cell, taking
 * the steepest step it can find. How much it can carry depends on how fast it
 * is going and how steeply the ground falls; where it can carry more than it
 * holds it cuts, and where it slows or runs onto flat ground it puts material
 * back down. Thousands of droplets leave the ridges sharp, the valleys graded
 * and the flats silted -- the shapes running water makes, which noise alone
 * has no way to produce.
 *
 * **Heights are metres and the grid is metres**, so every constant above means
 * something on the ground rather than in grid units: a knob set once holds its
 * meaning on a planet of any size and a map drawn at any level. That was
 * F-017's complaint about the erosion this replaces, whose incision moved with
 * the map's resolution.
 *
 * **No routing, no pits, no rivers.** The old pass needed the whole drainage
 * network computed first -- fill every basin, point every cell downhill, count
 * what drains through it -- and produced lakes and river channels as a side
 * effect. A droplet needs none of that: it only ever looks at the cell it is
 * standing on and the six around it.
 *
 * Every draw is hashed from the seed and the droplet's number rather than taken
 * from a running generator, and droplets run one after another, so the result
 * does not depend on anything but the seed.
 */
export function erodeDroplets(
	grid: CoarseGrid,
	height: Float64Array,
	seed: number,
	strength: number,
	cellMetres: number,
): void {
	const droplets = Math.round(strength * DROPLETS_PER_CELL * grid.count);
	if (droplets <= 0) return;

	for (let drop = 0; drop < droplets; drop++) {
		let cell = Math.min(
			grid.count - 1,
			Math.floor(hash3(drop & 0xffff, drop >>> 16, 0, seed) * grid.count),
		);
		let sediment = 0;
		let speed = 1;
		let water = 1;

		for (let step = 0; step < MAX_STEPS; step++) {
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

			const gradient = Math.max(fall / cellMetres, MIN_GRADIENT);
			const capacity = gradient * speed * water * CAPACITY;

			if (sediment > capacity) {
				const put = (sediment - capacity) * DEPOSIT_RATE;
				sediment -= put;
				height[cell] = height[cell]! + put;
			} else {
				// Never cut deeper than the step being taken, or a droplet digs
				// a pit under itself and the next one falls into it.
				const cut = Math.min(
					(capacity - sediment) * EROSION_RATE,
					fall * MAX_CUT,
				);
				sediment += cut;
				// Spread most of it over the ring, so one cell does not become a
				// spike of its own. What the ring cannot take stays here.
				let taken = 0;
				let degree = 0;
				for (let k = 0; k < 6; k++)
					if (grid.ring[cell * 6 + k]! >= 0) degree++;
				const share = degree > 0 ? (cut * (1 - CUT_SHARE)) / degree : 0;
				for (let k = 0; k < 6; k++) {
					const other = grid.ring[cell * 6 + k]!;
					if (other < 0) continue;
					height[other] = height[other]! - share;
					taken += share;
				}
				height[cell] = height[cell]! - (cut - taken);
			}

			speed = Math.sqrt(Math.max(0, speed * speed + fall * GRAVITY));
			water *= 1 - EVAPORATION;
			cell = next;
		}
	}
}
