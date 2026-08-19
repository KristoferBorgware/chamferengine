import { CoarseGrid } from "./CoarseGrid.js";
import { coastDistance } from "./coastDistance.js";
import { octaveNoise } from "../noise/octaveNoise.js";
import { hash3 } from "../noise/hash3.js";
import { latticeWeights } from "../../addressing/lattice/latticeWeights.js";
import { latticePosition } from "../../addressing/lattice/latticePosition.js";

/** The level the growth starts from, before any refinement. */
const SEED_LEVEL = 2;

/**
 * How much of the finished height the noise is, against the coast profile.
 *
 * The profile runs from `-0.6` offshore to `1.0` inland, so this is the noise's
 * share of that span. Above about a third the relief decides where the water
 * stops and the grown mask is drowned by it, which shows up as a growth weight
 * that changes nothing.
 */
const RELIEF_SHARE = 0.35;

/**
 * The shelf and the interior, as metres of nothing in particular against cells
 * from the coast. Straight lines between named points.
 */
const PROFILE: readonly (readonly [number, number])[] = [
	[-60, -0.6],
	[-6, -0.35],
	[-1, 0],
	[1, 0],
	[40, 0.8],
	[200, 1.0],
];

/** Where a distance from the coast falls on {@link PROFILE}. */
function alongProfile(d: number): number {
	if (d <= PROFILE[0]![0]) return PROFILE[0]![1];
	for (let k = 0; k < PROFILE.length - 1; k++) {
		const [x0, y0] = PROFILE[k]!;
		const [x1, y1] = PROFILE[k + 1]!;
		if (d <= x1) return y0 + ((y1 - y0) * (d - x0)) / (x1 - x0);
	}
	return PROFILE[PROFILE.length - 1]![1];
}

/** One integer per cell, hashed rather than drawn from a running generator. */
const roll = (seed: number, salt: number, cell: number): number =>
	hash3(
		cell & 0xffff,
		(cell >>> 16) ^ salt,
		Math.imul(salt, 2654435761) | 0,
		seed,
	);

/**
 * Land grown from scattered seeds, level by level, as a height.
 *
 * At the coarsest level every cell is land with a hashed probability. Refining
 * to the next level, a cell that already existed keeps its state and a cell
 * that appears between two of the other kind takes a coin. A growth pass then
 * pulls cells toward what surrounds them. **The coin roughens the coast at
 * every level and the growth pass smooths it**, so the two together set how
 * ragged it comes out.
 *
 * Every draw is hashed from the seed and the cell, never taken from a running
 * generator, so the result does not depend on the order cells are visited.
 *
 * A mask is not a height, and the rest of the pipeline needs one. The distance
 * to the coast supplies it: ground rises inland and falls away offshore, with
 * relief laid over the top. That relief is also what tempers the mask — laying
 * it on a baseline and cutting at sea level again pulls the thinnest filaments
 * back under, which took the measured ratio from `36.78` to `28.61` and the
 * islands from 312 to 193.
 *
 * **This is the one landform whose land fraction cannot be asked for.** There
 * is no percentile in the growth, so `creation` is a request rather than an
 * answer, and the sea level cut afterwards works on a field the growth has
 * already decided the shape of.
 */
export function grownHeight(
	grid: CoarseGrid,
	seed: number,
	creation: number,
	island: number,
	growthWeight: number,
	frequency: number,
	octaves: number,
	persistence: number,
	lacunarity: number,
	offsetX: number,
	offsetY: number,
	ridge: number,
): Float64Array {
	// The refinement needs a grid at every level on the way up, because a growth
	// pass compares a cell against its neighbours. The finest one is the
	// caller's, so only the coarser ones are built here -- and they are small:
	// every level below the last comes to a third of it.
	const grids: CoarseGrid[] = [];
	for (let l = SEED_LEVEL; l < grid.level; l++) grids.push(new CoarseGrid(l));
	grids.push(grid);

	let mask = new Uint8Array(grids[0]!.count);
	for (let cell = 0; cell < mask.length; cell++)
		mask[cell] = roll(seed, 1, cell) < creation ? 1 : 0;

	for (let step = 1; step < grids.length; step++) {
		const prev = grids[step - 1]!;
		const cur = grids[step]!;
		const next = new Uint8Array(cur.count);
		const n = cur.n;

		// Every cell of the finer grid is either a cell of the coarser one or
		// the midpoint of one of its edges. Which it is falls out of the integer
		// barycentric weights: all three even is inherited, and exactly two odd
		// names the edge, because the three weights sum to an even number.
		for (let face = 0; face < 20; face++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const at = cur.indexOf(face, i, j);
					if (at < 0) continue;
					const w = latticeWeights(n, i, j);
					const a = w[0]!;
					const b = w[1]!;
					const c = w[2]!;
					if (a % 2 === 0 && b % 2 === 0 && c % 2 === 0) {
						next[at] = mask[prev.indexOf(face, i >> 1, j >> 1)]!;
						continue;
					}
					const odd = [a % 2, b % 2, c % 2];
					const one = [a, b, c];
					const two = [a, b, c];
					let first = true;
					for (let k = 0; k < 3; k++)
						if (odd[k]) {
							if (first) {
								one[k]!++;
								two[k]!--;
								first = false;
							} else {
								one[k]!--;
								two[k]!++;
							}
						}
					// (a, b, c) is (n - i, i - j, j), so i and j come back as
					// b + c and c halved.
					const p1 = prev.indexOf(
						face,
						(one[1]! + one[2]!) >> 1,
						one[2]! >> 1,
					);
					const p2 = prev.indexOf(
						face,
						(two[1]! + two[2]!) >> 1,
						two[2]! >> 1,
					);
					const s1 = p1 >= 0 ? mask[p1]! : 0;
					const s2 = p2 >= 0 ? mask[p2]! : 0;
					next[at] =
						s1 === s2 ? s1 : roll(seed, 2 + step, at) < 0.5 ? 1 : 0;
				}

		// A few cells out at sea become land on their own, which is where an
		// archipelago away from any coast comes from.
		for (let cell = 0; cell < cur.count; cell++)
			if (!next[cell] && roll(seed, 40 + step, cell) < island)
				next[cell] = 1;

		// A cell is pulled toward what surrounds it, not flipped at random. The
		// difference decides whether this makes coastlines or static: flipping
		// a boundary cell either way is symmetric, so it adds as much noise as
		// it removes and the mask never consolidates however hard it is turned.
		// Moving toward the majority is what makes a scattering of seeds grow
		// into land.
		const before = Uint8Array.from(next);
		for (let cell = 0; cell < cur.count; cell++) {
			let land = 0;
			let degree = 0;
			for (let k = 0; k < 6; k++) {
				const ring = cur.ring[cell * 6 + k]!;
				if (ring < 0) continue;
				degree++;
				land += before[ring]!;
			}
			const majority =
				land * 2 > degree ? 1 : land * 2 < degree ? 0 : before[cell]!;
			if (majority === before[cell]) continue;
			if (roll(seed, 70 + step, cell) < growthWeight)
				next[cell] = majority;
		}
		mask = next;
	}

	const distance = coastDistance(grid, mask);
	const height = new Float64Array(grid.count);
	for (let cell = 0; cell < grid.count; cell++) {
		// Named points with straight lines between them, in cells from the coast.
		// **The shore has to be steep against the relief laid over it**: at a
		// gentle rise the relief decides where the water stops and the grown
		// mask is drowned by it, which shows up as a growth weight that changes
		// nothing. Half the fall offshore happens within six cells.
		const base = alongProfile(distance[cell]!);
		const x = grid.directions[cell * 3]!;
		const y = grid.directions[cell * 3 + 1]!;
		const z = grid.directions[cell * 3 + 2]!;
		height[cell] =
			base +
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
