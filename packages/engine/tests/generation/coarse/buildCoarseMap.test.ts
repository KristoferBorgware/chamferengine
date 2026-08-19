import { describe, expect, it } from "vitest";
import {
	CoarseGrid,
	buildCoarseMap,
	erodeDroplets,
	metreHeight,
	noiseHeight,
	seaLevelFor,
	seedFromString,
} from "chamfer/generation";

/** A map small enough to build several times in a test run. */
const LEVEL = 5;

/** Metres across a cell at that level on the worked planet. */
const CELL = 200;

describe("the coarse map", () => {
	it("leaves the intended fraction of the surface above sea level", () => {
		// Sea level is zero by construction, so "is this land" is one
		// comparison and there is no stored level to disagree with it.
		for (const landFraction of [0.1, 0.3, 0.6]) {
			const map = buildCoarseMap(1, {
				level: LEVEL,
				landFraction,
				erosion: 0,
			});
			let land = 0;
			for (const h of map.height) if (h > 0) land++;
			expect(land / map.count).toBeCloseTo(landFraction, 2);
		}
	});

	it("puts its tallest ground exactly where Relief asks for it", () => {
		// The knob is the answer, not a multiplier on however high this seed's
		// noise happened to reach, so two seeds at one setting give two worlds
		// of the same stature.
		for (const relief of [200, 600, 2000]) {
			const map = buildCoarseMap(1, { level: LEVEL, relief, erosion: 0 });
			let peak = 0;
			for (const h of map.height) if (h > peak) peak = h;
			expect(peak).toBeCloseTo(relief, 1);
		}
	});

	it("gives the same map for the same seed", () => {
		const a = buildCoarseMap(seedFromString("chamfer"), { level: LEVEL });
		const b = buildCoarseMap(seedFromString("chamfer"), { level: LEVEL });
		for (let cell = 0; cell < a.count; cell++)
			expect(a.height[cell]).toBe(b.height[cell]);
	});

	it("gives different maps for different seeds", () => {
		const a = buildCoarseMap(1, { level: LEVEL });
		const b = buildCoarseMap(2, { level: LEVEL });
		let differ = 0;
		for (let cell = 0; cell < a.count; cell++)
			if (a.height[cell] !== b.height[cell]) differ++;
		expect(differ).toBeGreaterThan(a.count / 2);
	});

	it("moves the ground itself, not only what erodes it", () => {
		// One seed for the whole world. There was a second one for a while, and
		// it split them: typing a new word gave back the same continents with
		// different channels cut into them.
		const a = buildCoarseMap(1, { level: LEVEL, erosion: 0 });
		const b = buildCoarseMap(2, { level: LEVEL, erosion: 0 });
		let differ = 0;
		for (let cell = 0; cell < a.count; cell++)
			if (a.height[cell] !== b.height[cell]) differ++;
		expect(differ).toBeGreaterThan(a.count / 2);
	});
});

describe("metreHeight", () => {
	it("puts the waterline at zero whatever the field was doing", () => {
		const raw = Float64Array.from([-3, -1, 0, 2, 5, 9]);
		const metres = metreHeight(raw, 0.5, 100);
		const sea = seaLevelFor(raw, 0.5);
		for (let cell = 0; cell < raw.length; cell++)
			expect(metres[cell]! > 0).toBe(raw[cell]! > sea);
	});

	it("scales the sea floor by the same number as the peaks", () => {
		const raw = Float64Array.from([-4, -1, 0, 1, 2, 4]);
		const a = metreHeight(raw, 0.5, 100);
		const b = metreHeight(raw, 0.5, 400);
		for (let cell = 0; cell < raw.length; cell++)
			expect(b[cell]).toBeCloseTo(4 * a[cell]!, 6);
	});
});

describe("erodeDroplets", () => {
	const grid = new CoarseGrid(LEVEL);
	const ground = (): Float64Array =>
		metreHeight(noiseHeight(grid, 21, 1.5, 4, 0.5, 2, 0, 0), 0.3, 600);

	it("does nothing at all at a strength of zero", () => {
		const before = ground();
		const after = Float64Array.from(before);
		erodeDroplets(grid, after, 1, 0, CELL);
		for (let cell = 0; cell < grid.count; cell++)
			expect(after[cell]).toBe(before[cell]);
	});

	it("moves ground without inventing or destroying it", () => {
		// Water carries material downhill and puts it down again; it does not
		// add any. The total may drift a little where a droplet is abandoned
		// mid-journey still holding sediment, and that has to stay small.
		const before = ground();
		const after = Float64Array.from(before);
		erodeDroplets(grid, after, 1, 1, CELL);
		const sum = (a: Float64Array): number => {
			let total = 0;
			for (const v of a) total += v;
			return total;
		};
		const moved = sum(before);
		expect(Math.abs(sum(after) - moved) / Math.abs(moved)).toBeLessThan(
			0.05,
		);
	});

	it("changes the ground, and more of it the harder it is turned", () => {
		const before = ground();
		const cut = (strength: number): number => {
			const after = Float64Array.from(before);
			erodeDroplets(grid, after, 1, strength, CELL);
			let total = 0;
			for (let cell = 0; cell < grid.count; cell++)
				total += Math.abs(after[cell]! - before[cell]!);
			return total;
		};
		const light = cut(0.2);
		expect(light).toBeGreaterThan(0);
		expect(cut(1)).toBeGreaterThan(light);
	});

	it("gives the same ground for the same seed", () => {
		const a = ground();
		const b = ground();
		erodeDroplets(grid, a, 5, 0.5, CELL);
		erodeDroplets(grid, b, 5, 0.5, CELL);
		for (let cell = 0; cell < grid.count; cell++)
			expect(a[cell]).toBe(b[cell]);
	});
});

describe("seaLevelFor", () => {
	it("returns a level float32 holds exactly", () => {
		const height = new Float64Array(1000);
		for (let cell = 0; cell < height.length; cell++)
			height[cell] = Math.sin(cell) * 0.7;
		const level = seaLevelFor(height, 0.3);
		expect(Math.fround(level)).toBe(level);
	});
});

describe("sampling a fine cell", () => {
	it("returns the stored value at a cell the coarse map sits on", () => {
		const map = buildCoarseMap(1, { level: 4 });
		const depth = 7;
		const step = 1 << (depth - map.level);
		for (const [face, i, j] of [
			[0, 0, 0],
			[3, 2, 5],
			[17, 9, 1],
		] as const) {
			const at = map.index.indexOf(face, i, j);
			expect(map.heightAt(face, i * step, j * step, depth)).toBeCloseTo(
				map.height[at]!,
				5,
			);
		}
	});
});
