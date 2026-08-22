import { describe, expect, it } from "vitest";
import {
	CoarseGrid,
	erodeDroplets,
	erodeFreeDroplets,
	layeredHeight,
	metreHeight,
	seedFromString,
} from "chamfer/generation";

/**
 * The droplet that stands between cells rather than on one.
 *
 * What it is for is two things the cell-to-cell walk gets wrong: its direction
 * is one of six, so the walk locks to a lattice axis, and its cut lands on one
 * cell and its ring, which is a spike. Both show as a number about the ground
 * afterwards rather than as a property of the code, so both are measured here.
 */
// A 64 m cell at level 6 is a 6,801 m planet, the shipped radius. The two
// walks come out alike on a map too coarse to hold what they differ about: at
// a 128 m cell the median moves x1.02 and x0.97, and at 64 m x1.21 and x1.06.
const LEVEL = 6;
const CELL = 64;
const SEED = seedFromString("chamfer");

const grid = new CoarseGrid(LEVEL);

/** The shipped ground in metres, which is what the pass is written for. */
function ground(): Float64Array {
	const field = layeredHeight(grid, SEED, {
		level: LEVEL,
		cellMetres: CELL,
	});
	return metreHeight(field.raw, {
		landFraction: 0.65,
		relief: 1100,
		seaDepth: 130,
		seaLevel: 0,
	});
}

/**
 * How steep the land is, as three percentiles of metres of fall per metre.
 *
 * The steepest of a cell's six neighbours, over land cells. **A pass that
 * carves moves the tail and leaves the middle alone**; one whose median climbs
 * with it is adding roughness everywhere instead.
 */
function slopes(height: Float64Array): {
	median: number;
	ninetyNine: number;
} {
	const out: number[] = [];
	for (let cell = 0; cell < grid.count; cell++) {
		if (height[cell]! <= 0) continue;
		let worst = 0;
		for (let k = 0; k < 6; k++) {
			const other = grid.ring[cell * 6 + k]!;
			if (other < 0) continue;
			const fall = Math.abs(height[cell]! - height[other]!) / CELL;
			if (fall > worst) worst = fall;
		}
		out.push(worst);
	}
	out.sort((a, b) => a - b);
	const at = (p: number): number =>
		out[Math.min(out.length - 1, Math.floor(out.length * p))]!;
	return { median: at(0.5), ninetyNine: at(0.99) };
}

describe("erodeFreeDroplets", () => {
	it("does nothing at all at a strength of zero", () => {
		const height = ground();
		const before = Float64Array.from(height);
		expect(erodeFreeDroplets(grid, height, SEED, 0, CELL)).toBe(0);
		expect(Array.from(height)).toEqual(Array.from(before));
	});

	it("is a function of the seed and nothing else", () => {
		const a = ground();
		const b = ground();
		erodeFreeDroplets(grid, a, SEED, 1, CELL);
		erodeFreeDroplets(grid, b, SEED, 1, CELL);
		expect(Array.from(b)).toEqual(Array.from(a));
	});

	it("leaves the same field whether it runs in one call or in slices", () => {
		// Droplets run one after another, so a contiguous range is the same
		// arithmetic in the same order. That is what lets a caller show
		// progress without changing the world it builds.
		const whole = ground();
		const sliced = ground();
		const droplets = erodeFreeDroplets(grid, whole, SEED, 1, CELL);
		const SLICE = 1000;
		for (let from = 0; from < droplets; from += SLICE)
			erodeFreeDroplets(grid, sliced, SEED, 1, CELL, {
				from,
				take: SLICE,
			});
		expect(Array.from(sliced)).toEqual(Array.from(whole));
	});

	it("moves the ground less than the cell-to-cell walk, and less steeply", () => {
		// The cut is spread over the three lattice points the droplet stands
		// over rather than dug into one, so the same water leaves a gentler
		// surface.
		const before = slopes(ground());
		const cellWalk = ground();
		const freeWalk = ground();
		erodeDroplets(grid, cellWalk, SEED, 1, CELL);
		erodeFreeDroplets(grid, freeWalk, SEED, 1, CELL);
		const cell = slopes(cellWalk);
		const free = slopes(freeWalk);
		expect(cell.median).toBeGreaterThan(before.median);
		expect(free.median).toBeLessThan(cell.median);
		expect(free.ninetyNine).toBeLessThan(cell.ninetyNine);
	});

	it("crosses a face edge rather than stopping at one", () => {
		// A droplet that gave up at a seam would leave the thirty face edges
		// cut less than their surroundings, so the ground moved within a step
		// of an edge has to be in the same range as the ground away from it.
		const height = ground();
		const before = Float64Array.from(height);
		erodeFreeDroplets(grid, height, SEED, 1, CELL);
		const n = grid.n;
		let onEdge = 0;
		let onEdgeMoved = 0;
		let inside = 0;
		let insideMoved = 0;
		for (let face = 0; face < 20; face++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const cell = grid.indexOf(face, i, j);
					const moved = Math.abs(height[cell]! - before[cell]!);
					// A cell within one step of a face edge, against one three
					// or more steps inside it.
					if (i <= 1 || j <= 1 || i + j >= n - 1) {
						onEdge++;
						onEdgeMoved += moved;
					} else if (i > 3 && j > 3 && i + j < n - 3) {
						inside++;
						insideMoved += moved;
					}
				}
		const rim = onEdgeMoved / onEdge;
		const middle = insideMoved / inside;
		expect(rim).toBeGreaterThan(middle * 0.6);
		expect(rim).toBeLessThan(middle * 1.6);
	});
});
