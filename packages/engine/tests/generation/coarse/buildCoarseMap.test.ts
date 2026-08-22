import { describe, expect, it } from "vitest";
import type { CoarseMapOptions, MetreScale } from "chamfer/generation";
import {
	CoarseGrid,
	TERRAIN_LAYER_DEFAULT,
	buildCoarseMap,
	erodeDroplets,
	layerNoise,
	layeredHeight,
	metreHeight,
	seaLevelFor,
	seedFromString,
	shapeLayers,
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

	it("puts the sea floor exactly where Sea depth asks for it", () => {
		// The two are scaled apart, because one scale for both let the ocean
		// spend twice the layer budget the mountains got, on ground nobody
		// ever sees.
		for (const seaDepth of [50, 120, 400]) {
			const map = buildCoarseMap(1, {
				level: LEVEL,
				seaDepth,
				erosion: 0,
			});
			let floor = 0;
			for (const h of map.height) if (h < floor) floor = h;
			expect(-floor).toBeCloseTo(seaDepth, 1);
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
	const scale = (
		relief: number,
		seaDepth: number,
		over: Partial<MetreScale> = {},
	): MetreScale => ({
		landFraction: 0.5,
		relief,
		seaDepth,
		seaLevel: 0,
		...over,
	});

	it("puts the waterline at zero whatever the field was doing", () => {
		const raw = Float64Array.from([-3, -1, 0, 2, 5, 9]);
		const metres = metreHeight(raw, scale(100, 100));
		const sea = seaLevelFor(raw, 0.5);
		for (let cell = 0; cell < raw.length; cell++)
			expect(metres[cell]! > 0).toBe(raw[cell]! > sea);
	});

	it("scales the sea floor by the same number as the peaks", () => {
		const raw = Float64Array.from([-4, -1, 0, 1, 2, 4]);
		const a = metreHeight(raw, scale(100, 100));
		const b = metreHeight(raw, scale(400, 400));
		for (let cell = 0; cell < raw.length; cell++)
			expect(b[cell]).toBeCloseTo(4 * a[cell]!, 6);
	});

	it("puts the tallest point at exactly Relief, whatever the field reached", () => {
		// The fit divides by the field's own peak, which is what makes Relief a
		// number that can be asked for rather than a multiplier on however far
		// this seed's noise happened to go.
		const grid = new CoarseGrid(LEVEL);
		const field = layeredHeight(grid, seedFromString("chamfer"));
		const height = metreHeight(field.raw, {
			landFraction: 0.65,
			relief: 1100,
			seaDepth: 130,
			seaLevel: 0,
		});
		let tallest = -Infinity;
		let deepest = Infinity;
		for (const v of height) {
			if (v > tallest) tallest = v;
			if (v < deepest) deepest = v;
		}
		expect(tallest).toBeCloseTo(1100, 6);
		expect(deepest).toBeCloseTo(-130, 6);
	});

	it("lifts every height by the metres the sea was dropped", () => {
		// Draining moves the water, never the ground: the whole field shifts by
		// one number and its shape is untouched.
		const raw = Float64Array.from([-4, -1, 0, 1, 2, 4]);
		const wet = metreHeight(raw, scale(100, 100));
		const dry = metreHeight(raw, scale(100, 100, { seaLevel: -30 }));
		for (let cell = 0; cell < raw.length; cell++)
			expect(dry[cell]).toBeCloseTo(wet[cell]! + 30, 9);
	});
});

describe("erodeDroplets", () => {
	const grid = new CoarseGrid(LEVEL);
	const ground = (): Float64Array =>
		metreHeight(layeredHeight(grid, 21).raw, {
			landFraction: 0.3,
			relief: 600,
			seaDepth: 240,
			seaLevel: 0,
		});

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

describe("the two halves of the surface pass", () => {
	const grid = new CoarseGrid(LEVEL);
	const seed = seedFromString("chamfer");

	/**
	 * The reason the halves exist is speed, so the thing to guarantee is that
	 * speed changed and nothing else. Bit-for-bit, not close to: the field is
	 * what a spline is evaluated at and what a sea level is a percentile of.
	 */
	const same = (options: CoarseMapOptions): void => {
		const whole = layeredHeight(grid, seed, options);
		const halves = shapeLayers(layerNoise(grid, seed, options), options);
		expect(halves.overLine).toBe(whole.overLine);
		for (let cell = 0; cell < grid.count; cell++) {
			expect(halves.raw[cell]).toBe(whole.raw[cell]);
			expect(halves.terrain[cell]).toBe(whole.terrain[cell]);
			expect(halves.mountain[cell]).toBe(whole.mountain[cell]);
		}
	};

	it("gives the shipped world bit for bit", () => {
		same({});
	});

	it("gives the roughen merge bit for bit", () => {
		same({ merge: "roughen" });
	});

	it("gives a world with no mountain layer bit for bit", () => {
		same({ mountainLayer: false });
		same({ mountainLayer: false, merge: "roughen" });
	});

	/** What the cache is for: one field, read through two different curves. */
	it("re-shapes one field into two worlds", () => {
		const noise = layerNoise(grid, seed);
		const straight = shapeLayers(noise, {
			terrain: {
				...TERRAIN_LAYER_DEFAULT,
				curve: [
					[-1, 0],
					[1, 1],
				],
			},
		});
		const shipped = shapeLayers(noise, {});
		let apart = 0;
		for (let cell = 0; cell < grid.count; cell++)
			if (straight.raw[cell] !== shipped.raw[cell]) apart++;
		expect(apart).toBeGreaterThan(grid.count * 0.9);
	});
});

describe("the mountain line", () => {
	const grid = new CoarseGrid(LEVEL);
	const share = (mountainLine: number): number =>
		layeredHeight(grid, seedFromString("chamfer"), { mountainLine })
			.overLine;

	/**
	 * The number the row shows is a count, and this is why it is worth showing:
	 * the line is a fraction of the terrain curve's own reach and the curve
	 * decides how much world lands in the top of it, so the same fraction opens
	 * the gate over wildly different amounts of planet.
	 */
	it("falls as the line rises, and never rises", () => {
		let last = 1.0001;
		for (const line of [0, 0.25, 0.5, 0.75, 0.95]) {
			const now = share(line);
			expect(now).toBeLessThanOrEqual(last);
			last = now;
		}
	});

	it("is the whole planet at the bottom of the curve and little at the top", () => {
		expect(share(0)).toBeGreaterThan(0.99);
		expect(share(0.95)).toBeLessThan(0.1);
	});

	it("counts the cells the map is built from", () => {
		const line = 0.5;
		const field = layeredHeight(grid, seedFromString("chamfer"), {
			mountainLine: line,
		});
		// Every cell whose terrain curve stands above the line, counted here
		// the long way round: the share is that count over the grid's own
		// cells, so a hundredth of a cell of rounding is a real disagreement.
		expect(field.overLine * grid.count).toBeCloseTo(
			Math.round(field.overLine * grid.count),
			9,
		);
		expect(field.overLine).toBeGreaterThan(0);
		expect(field.overLine).toBeLessThan(1);
	});
});
