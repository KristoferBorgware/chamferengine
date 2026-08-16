import { describe, expect, it } from "vitest";
import {
	daylight,
	pentagonDiscCells,
	skyDiscCells,
	skyExposure,
	sunDirection,
	terminatorSpeed,
} from "chamfer/light";
import { CoarseGrid } from "chamfer/generation";
import { NORTH, SOUTH } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

describe("how far a light reaches", () => {
	const grid = new CoarseGrid(4);

	/** Every cell within `range` steps of one, over the grid's own ring. */
	function reach(start: number, range: number): number {
		let front = new Set([start]);
		const seen = new Set([start]);
		for (let step = 0; step < range; step++) {
			const next = new Set<number>();
			for (const cell of front)
				for (let k = 0; k < 6; k++) {
					const other = grid.ring[cell * 6 + k]!;
					if (other < 0 || seen.has(other)) continue;
					seen.add(other);
					next.add(other);
				}
			front = next;
		}
		return seen.size;
	}

	/** The cell furthest from any of the twelve pentagons. */
	function deepestHexagon(): number {
		const away = new Int32Array(grid.count).fill(-1);
		const queue: number[] = [];
		for (let cell = 0; cell < grid.count; cell++)
			if (grid.degreeOf(cell) === 5) {
				away[cell] = 0;
				queue.push(cell);
			}
		for (let at = 0; at < queue.length; at++) {
			const cell = queue[at]!;
			for (let k = 0; k < 6; k++) {
				const other = grid.ring[cell * 6 + k]!;
				if (other < 0 || away[other]! >= 0) continue;
				away[other] = away[cell]! + 1;
				queue.push(other);
			}
		}
		let best = 0;
		for (let cell = 0; cell < grid.count; cell++)
			if (away[cell]! > away[best]!) best = cell;
		return best;
	}

	it("counts 3r^2 + 3r + 1 cells around a hexagon", () => {
		// Half again what a square grid reaches over the same steps, which is
		// 2r^2 + 2r + 1. Walked over the engine's own adjacency rather than
		// taken from the formula.
		//
		// The disc has to clear the twelve pentagons. A ring that reaches one
		// holds 5k cells rather than 6k, and the count comes out short.
		const hexagon = deepestHexagon();
		for (const range of [1, 2, 3, 4]) {
			expect(reach(hexagon, range)).toBe(skyDiscCells(range));
			expect(skyDiscCells(range)).toBeGreaterThan(
				2 * range * range + 2 * range + 1,
			);
		}
	});

	it("counts 1 + 5r(r+1)/2 cells around a pentagon", () => {
		// Five sixths of a hexagon's reach. A ring around a pentagon holds 5k
		// cells where a hexagon's holds 6k, so a torch there is not dimmer --
		// there is less world within reach of it.
		let pentagon = -1;
		for (let cell = 0; cell < grid.count; cell++)
			if (grid.degreeOf(cell) === 5) {
				pentagon = cell;
				break;
			}
		expect(pentagon).toBeGreaterThanOrEqual(0);
		for (const range of [1, 2, 3, 4]) {
			expect(reach(pentagon, range)).toBe(pentagonDiscCells(range));
		}
		const far = 12;
		expect(pentagonDiscCells(far) / skyDiscCells(far)).toBeCloseTo(
			5 / 6,
			1,
		);
	});
});

describe("the terminator", () => {
	it("walks at 1.4 m/s on a two-hour day", () => {
		// One circumference a day. On a planet this small that is walking pace,
		// so a shorter day is one a player outruns.
		expect(terminatorSpeed(1700, 2.12 * 3600)).toBeCloseTo(1.4, 1);
	});

	it("goes faster on a smaller planet and slower on a longer day", () => {
		expect(terminatorSpeed(3400, 7632)).toBeCloseTo(
			2 * terminatorSpeed(1700, 7632),
			9,
		);
		expect(terminatorSpeed(1700, 15264)).toBeCloseTo(
			terminatorSpeed(1700, 7632) / 2,
			9,
		);
	});
});

describe("daylight", () => {
	const at = (up: Vec3, sun: Vec3) =>
		daylight(up.x, up.y, up.z, sun.x, sun.y, sun.z);

	it("is one dot product, and nothing is stored", () => {
		const up = new Vec3(0, 1, 0);
		expect(at(up, new Vec3(0, 1, 0))).toBe(1);
		expect(at(up, new Vec3(0, -1, 0))).toBe(0);
		expect(at(up, new Vec3(1, 0, 0))).toBeCloseTo(0.5, 6);
	});

	it("lights one side of the planet and not the other", () => {
		const sun = new Vec3(1, 0, 0);
		expect(at(new Vec3(1, 0, 0), sun)).toBe(1);
		expect(at(new Vec3(-1, 0, 0), sun)).toBe(0);
	});
});

describe("sunDirection", () => {
	it("stays a unit vector all day", () => {
		for (let t = 0; t < 1; t += 0.05)
			expect(sunDirection(t, NORTH).length()).toBeCloseTo(1, 12);
	});

	it("comes back where it started after one turn", () => {
		const start = sunDirection(0, NORTH);
		const round = sunDirection(1, NORTH);
		expect(round.x).toBeCloseTo(start.x, 9);
		expect(round.y).toBeCloseTo(start.y, 9);
		expect(round.z).toBeCloseTo(start.z, 9);
	});

	it("brings day and night everywhere off the axis", () => {
		const places = [
			new Vec3(1, 0, 0),
			new Vec3(0, 0, 1),
			NORTH.cross(new Vec3(0, 0, 1)).normalize(),
		];
		for (const place of places) {
			let brightest = 0;
			let darkest = 1;
			for (let t = 0; t < 1; t += 0.02) {
				const sun = sunDirection(t, NORTH);
				const lit = daylight(
					place.x,
					place.y,
					place.z,
					sun.x,
					sun.y,
					sun.z,
				);
				brightest = Math.max(brightest, lit);
				darkest = Math.min(darkest, lit);
			}
			expect(brightest).toBeGreaterThan(0.5);
			expect(darkest).toBeLessThan(0.5);
		}
	});

	it("holds the two poles at twilight all day", () => {
		// The sun keeps a fixed angle to the axis, so a place on the axis keeps
		// a fixed angle to the sun. With the sun in the plane across the axis
		// the two poles sit on the line between day and night and stay there.
		// Both are pentagons, and both are the coordinate poles.
		for (const pole of [NORTH, SOUTH]) {
			for (let t = 0; t < 1; t += 0.05) {
				const sun = sunDirection(t, NORTH);
				expect(Math.abs(pole.dot(sun))).toBeCloseTo(0, 9);
			}
		}
	});

	it("leans when asked to, and then a pole keeps the sun up", () => {
		let highest = 0;
		for (let t = 0; t < 1; t += 0.02)
			highest = Math.max(
				highest,
				NORTH.dot(sunDirection(t, NORTH, 0.41)),
			);
		expect(highest).toBeGreaterThan(0.35);
	});
});

describe("skyExposure", () => {
	it("gives a ridge the whole sky", () => {
		// Layers count downward, so a larger number is lower ground.
		expect(skyExposure(40, [41, 42, 43, 44, 45, 46], 6)).toBe(1);
		expect(skyExposure(40, [40, 40, 40, 40, 40, 40], 6)).toBe(1);
	});

	it("shuts a hollow down to the floor it allows", () => {
		expect(skyExposure(40, [30, 30, 30, 30, 30, 30], 6, 0.35)).toBeCloseTo(
			0.35,
			9,
		);
	});

	it("falls as the ground around a cell rises", () => {
		const shallow = skyExposure(40, [38, 38, 38, 38, 38, 38], 6);
		const deep = skyExposure(40, [34, 34, 34, 34, 34, 34], 6);
		expect(shallow).toBeLessThan(1);
		expect(deep).toBeLessThan(shallow);
		expect(deep).toBeGreaterThanOrEqual(0.35);
	});

	it("counts a pentagon's five neighbours rather than a missing sixth", () => {
		// Light is a scalar, so a short ring changes the count and nothing else.
		const five = skyExposure(40, [36, 36, 36, 36, 36], 6);
		const six = skyExposure(40, [36, 36, 36, 36, 36, 36], 6);
		expect(five).toBeCloseTo(six, 9);
	});

	it("takes the whole sky where there are no neighbours at all", () => {
		expect(skyExposure(40, [], 6)).toBe(1);
	});
});
