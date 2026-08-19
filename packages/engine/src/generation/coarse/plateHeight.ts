import type { CoarseGrid } from "./CoarseGrid.js";
import { octaveNoise } from "../noise/octaveNoise.js";
import { hash3 } from "../noise/hash3.js";

/** Offsets from the world seed, so the seats, the spins and the relief differ. */
const SEAT_SEED_OFFSET = 100;
const SPIN_SEED_OFFSET = 300;
const BIAS_SEED_OFFSET = 11;

/** The level `reach` is stated at, doubling for every level finer. */
const REACH_LEVEL = 7;

/** How much of the finished height the noise is, against the plate structure. */
const RELIEF_SHARE = 0.35;

/** The fastest a plate turns, from the `rate` drawn for each one below. */
const MAX_SPIN = 1.5;

/**
 * What a seam's closing speed is divided by, to land in `-1` to `1`.
 *
 * A plate's motion at a cell is its spin crossed with the cell direction, so
 * it is at most `MAX_SPIN` long, and two plates meeting head on close at twice
 * that. Dividing by it makes `upliftWeight` the height of the tallest range
 * this world can grow, which is what that knob says it is.
 *
 * **A constant and not the largest closing speed the planet contains.** That
 * maximum rises with the number of seam cells, and there are more of them at
 * every finer level, so the same seed would grow different mountains on maps
 * of different resolutions -- which is what `reach` doubling is here to
 * prevent.
 */
const MAX_CLOSING_RATE = 2 * MAX_SPIN;

/**
 * A direction from the seed and an index, without an angle anywhere.
 *
 * Three hashed components divided by their own length. Placing a plate with
 * `sin` and `cos` would put a transcendental in a field two clients have to
 * agree on to the bit, and a wrapping multiply and a square root are both
 * pinned by IEEE 754. A draw landing near the middle is thrown out, because
 * normalising it would swing wildly on its last bits.
 */
function hashedDirection(
	seed: number,
	salt: number,
	k: number,
): [number, number, number] {
	for (let attempt = 0; attempt < 8; attempt++) {
		const s = salt + attempt * 977;
		const x = 2 * hash3(k, s, 0, seed) - 1;
		const y = 2 * hash3(k, s, 1, seed) - 1;
		const z = 2 * hash3(k, s, 2, seed) - 1;
		const d2 = x * x + y * y + z * z;
		if (d2 > 0.05 && d2 <= 1) {
			const l = Math.sqrt(d2);
			return [x / l, y / l, z / l];
		}
	}
	return [0, 0, 1];
}

/**
 * The surface, from plates that drift and collide.
 *
 * Scatter a few dozen seats and give every cell its nearest, which is a Voronoi
 * diagram on the sphere and the same `argmax` of dot products the face lookup
 * uses. Each plate carries an angular velocity, so its motion at a cell is the
 * cross product of that axis with the cell — which is how plate motion is
 * described anyway — and a bias making it ocean floor or continent.
 *
 * Where two plates close on each other along the step between two cells a range
 * rises, and where they part a rift drops. That value is carried inland,
 * weaker at every step, and each cell remembers the seam value that reached it:
 * the cell it was reached from is a seam cell only on the first step and
 * carries nothing afterwards.
 *
 * **The reach is a distance, so it doubles for every level finer than the one
 * it is stated at.** Counting a fixed number of cells instead makes a range
 * twice as wide on a map drawn at half the resolution, and the same seed grows
 * different mountains at different resolutions.
 *
 * **A plate's bias is a step, and that is what sets how tall its interior
 * stands.** Land sits a flat `2 x biasWeight` above sea level over a whole
 * plate, however far inland, because sea level lands just above the ocean
 * plates' band. At `0.5` that step was `1.0` on a terrain ramp `0.7` wide, so
 * every continent drew as one saturated white slab with its shape lost. It is
 * `0.15` for that reason and not by taste.
 */
export function plateHeight(
	grid: CoarseGrid,
	seed: number,
	plates: number,
	oceanShare: number,
	biasWeight: number,
	upliftWeight: number,
	upliftReach: number,
	frequency: number,
	octaves: number,
	persistence: number,
	lacunarity: number,
	offsetX: number,
	offsetY: number,
	ridge: number,
): Float64Array {
	const seats: [number, number, number][] = [];
	const spins: [number, number, number][] = [];
	const bias: number[] = [];
	for (let k = 0; k < plates; k++) {
		seats.push(hashedDirection(seed, SEAT_SEED_OFFSET, k));
		const axis = hashedDirection(seed, SPIN_SEED_OFFSET, k);
		const rate = MAX_SPIN - 1 + hash3(k, 7, 0, seed);
		spins.push([axis[0] * rate, axis[1] * rate, axis[2] * rate]);
		bias.push(hash3(k, BIAS_SEED_OFFSET, 0, seed) < oceanShare ? -1 : 1);
	}

	const owner = new Int32Array(grid.count);
	for (let cell = 0; cell < grid.count; cell++) {
		const x = grid.directions[cell * 3]!;
		const y = grid.directions[cell * 3 + 1]!;
		const z = grid.directions[cell * 3 + 2]!;
		let best = 0;
		let bestDot = -2;
		for (let k = 0; k < plates; k++) {
			const d = x * seats[k]![0] + y * seats[k]![1] + z * seats[k]![2];
			if (d > bestDot) {
				bestDot = d;
				best = k;
			}
		}
		owner[cell] = best;
	}

	// How fast the two plates close along the step between the cells.
	const seam = new Float64Array(grid.count);
	const front: number[] = [];
	for (let cell = 0; cell < grid.count; cell++) {
		const a = owner[cell]!;
		const ax = grid.directions[cell * 3]!;
		const ay = grid.directions[cell * 3 + 1]!;
		const az = grid.directions[cell * 3 + 2]!;
		let sum = 0;
		let n = 0;
		for (let k = 0; k < 6; k++) {
			const other = grid.ring[cell * 6 + k]!;
			if (other < 0) continue;
			const b = owner[other]!;
			if (b === a) continue;
			const bx = grid.directions[other * 3]!;
			const by = grid.directions[other * 3 + 1]!;
			const bz = grid.directions[other * 3 + 2]!;
			const sx = bx - ax;
			const sy = by - ay;
			const sz = bz - az;
			const l = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
			const va = [
				spins[a]![1] * az - spins[a]![2] * ay,
				spins[a]![2] * ax - spins[a]![0] * az,
				spins[a]![0] * ay - spins[a]![1] * ax,
			];
			const vb = [
				spins[b]![1] * bz - spins[b]![2] * by,
				spins[b]![2] * bx - spins[b]![0] * bz,
				spins[b]![0] * by - spins[b]![1] * bx,
			];
			sum +=
				-(
					(va[0]! - vb[0]!) * sx +
					(va[1]! - vb[1]!) * sy +
					(va[2]! - vb[2]!) * sz
				) / l;
			n++;
		}
		if (n) {
			seam[cell] = sum / n / MAX_CLOSING_RATE;
			front.push(cell);
		}
	}

	const reach = Math.max(
		1,
		Math.round(upliftReach * 2 ** (grid.level - REACH_LEVEL)),
	);
	const uplift = new Float64Array(grid.count);
	const origin = new Float64Array(grid.count);
	const seen = new Uint8Array(grid.count);
	let wave = front;
	for (const cell of wave) {
		seen[cell] = 1;
		origin[cell] = seam[cell]!;
		uplift[cell] = seam[cell]!;
	}
	for (let step = 1; step <= reach && wave.length; step++) {
		const decay = 1 - step / (reach + 1);
		const next: number[] = [];
		for (const cell of wave)
			for (let k = 0; k < 6; k++) {
				const other = grid.ring[cell * 6 + k]!;
				if (other < 0 || seen[other]) continue;
				seen[other] = 1;
				origin[other] = origin[cell]!;
				uplift[other] = origin[cell]! * decay;
				next.push(other);
			}
		wave = next;
	}

	const height = new Float64Array(grid.count);
	for (let cell = 0; cell < grid.count; cell++) {
		const x = grid.directions[cell * 3]!;
		const y = grid.directions[cell * 3 + 1]!;
		const z = grid.directions[cell * 3 + 2]!;
		height[cell] =
			biasWeight * bias[owner[cell]!]! +
			upliftWeight * uplift[cell]! +
			RELIEF_SHARE *
				octaveNoise(
					x,
					y,
					z,
					seed,
					frequency,
					octaves,
					persistence,
					lacunarity,
					offsetX,
					offsetY,
					ridge,
				);
	}
	return height;
}
