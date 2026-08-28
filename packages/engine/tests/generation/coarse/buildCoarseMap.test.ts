import { describe, expect, it } from "vitest";
import type { CoarseMapOptions } from "chamfer/generation";
import {
	CONTINENT_LAYER_DEFAULT,
	CoarseGrid,
	buildCoarseMap,
	erodeDroplets,
	heightFrom,
	layerNoise,
	layeredHeight,
	seedFromString,
	shapeLayers,
} from "chamfer/generation";

/** A map small enough to build several times in a test run. */
const LEVEL = 5;

/** Metres across a cell at that level on the worked planet. */
const CELL = 200;

describe("the coarse map", () => {
	const wet = (over: CoarseMapOptions): number => {
		const map = buildCoarseMap(1, { level: LEVEL, ...over });
		let land = 0;
		for (const h of map.height) if (h > 0) land++;
		return land;
	};

	it("puts the coast where the continentalness curve crosses its middle", () => {
		// **The level's shore is the curve's own middle and no metre knob moves
		// it.** That is what the height coming out metric buys, against a fit
		// to an asked-for land share where dragging Relief moved the coast.
		const flat = { peakRelief: 0 };
		const base = wet(flat);
		expect(wet({ ...flat, relief: 2000 })).toBe(base);
		expect(wet({ ...flat, seaDepth: 900 })).toBe(base);
		expect(wet({ ...flat, erosionBite: 0 })).toBe(base);
	});

	it("lets the peak term move the shoreline, and only the peak term", () => {
		// **Peaks are added after the level, so they cross the waterline.** A
		// cell the curve put just under can be lifted over by a peak and one
		// just over can be cut below by a valley, which is what makes a coast
		// ragged rather than a contour of one field. It is a perturbation of
		// the line and not a new line: measured on this world it moves a few
		// percent of the cells, where the curve itself moves all of them.
		const flat = wet({ peakRelief: 0 });
		const peaked = wet({ peakRelief: 220 });
		expect(peaked).not.toBe(flat);
		expect(Math.abs(peaked - flat) / flat).toBeLessThan(0.1);
	});

	it("moves the shore when the continentalness curve moves", () => {
		const all = buildCoarseMap(1, { level: LEVEL }).count;
		// Every point of the curve lifted above its middle: all of it is land.
		const raised = wet({
			peakRelief: 0,
			continent: {
				...CONTINENT_LAYER_DEFAULT,
				curve: [
					[-1, 0.6],
					[1, 1],
				],
			},
		});
		expect(raised).toBe(all);
		// And dropped below it: none of it is.
		const sunk = wet({
			peakRelief: 0,
			continent: {
				...CONTINENT_LAYER_DEFAULT,
				curve: [
					[-1, 0],
					[1, 0.4],
				],
			},
		});
		expect(sunk).toBe(0);
	});

	it("scales land and the sea floor apart", () => {
		// One scale for the whole axis is what makes a sea-depth knob flood the
		// world: it rescales the metres a curve point is worth, which drags sea
		// level across the curve and moves the coast.
		const deepest = (seaDepth: number): number => {
			// The peak term is added after the level and does not scale with
			// it, so it is taken out to measure the level alone.
			const map = buildCoarseMap(1, {
				level: LEVEL,
				seaDepth,
				peakRelief: 0,
			});
			let floor = 0;
			for (const h of map.height) if (h < floor) floor = h;
			return floor;
		};
		expect(deepest(800)).toBeCloseTo(2 * deepest(400), 6);
		const tallest = (relief: number): number => {
			const map = buildCoarseMap(1, {
				level: LEVEL,
				relief,
				// The peak term is added after the level and does not scale
				// with it, so it is taken out to measure the level alone.
				peakRelief: 0,
				erosionBite: 0,
			});
			let peak = 0;
			for (const h of map.height) if (h > peak) peak = h;
			return peak;
		};
		expect(tallest(1600)).toBeCloseTo(2 * tallest(800), 6);
	});

	it("holds the tallest ground inside relief plus the peak scale", () => {
		// **Relief is no longer a fit.** With the metres coming out of the
		// curve there is nothing dividing by the field's own peak, so the
		// tallest point is what the curve reached times relief plus a full
		// peak -- bounded rather than exact, which is what buys a coast no
		// metre knob can move.
		for (const relief of [200, 600, 2000]) {
			const map = buildCoarseMap(1, {
				level: LEVEL,
				relief,
				peakRelief: 220,
			});
			let peak = 0;
			for (const h of map.height) if (h > peak) peak = h;
			expect(peak).toBeLessThanOrEqual(relief + 220 + 1e-6);
			expect(peak).toBeGreaterThan(0);
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
});

describe("heightFrom", () => {
	it("wears the level down in proportion to the bite, and never the sea bed", () => {
		// Erosion takes the relief outright and the level in proportion, and
		// below sea level nothing is worn: the ocean floor is not what the rain
		// is falling on, and wearing it would lift the bed toward the surface.
		const high = (bite: number): number =>
			heightFrom(1, 0.3, 0, { erosionBite: bite, peakRelief: 0 });
		expect(high(0)).toBeGreaterThan(high(1));
		const low = (bite: number): number =>
			heightFrom(-1, 0.3, 0, { erosionBite: bite, peakRelief: 0 });
		expect(low(0)).toBe(low(1));
	});

	it("adds no peak where erosion has taken everything", () => {
		// What survives is `1 - cut`, so a region the curve sends to 1 is flat
		// whatever peaks and valleys is doing -- the one thing a single stack of
		// octaves can never say.
		const flat = {
			erosion: {
				...CONTINENT_LAYER_DEFAULT,
				curve: [
					[-1, 1],
					[1, 1],
				] as const,
			},
			erosionBite: 0,
		};
		expect(heightFrom(0.5, 0, 1, flat)).toBe(heightFrom(0.5, 0, -1, flat));
	});

	it("reads continentalness at the middle of the field when it is off", () => {
		// Off has to be an exact statement about what the layer contributes,
		// and continentalness has no neutral -- something must set the level.
		expect(heightFrom(0.9, 0, 0, { continentLayer: false })).toBe(
			heightFrom(0, 0, 0, {}),
		);
	});

	it("agrees with the whole-map build cell for cell", () => {
		const grid = new CoarseGrid(LEVEL);
		const seed = seedFromString("chamfer");
		const noise = layerNoise(grid, seed);
		const field = shapeLayers(noise);
		for (let cell = 0; cell < grid.count; cell += 37)
			expect(field.raw[cell]).toBe(
				heightFrom(
					noise.continent[cell]!,
					noise.erosion[cell]!,
					noise.peaks[cell]!,
				),
			);
	});

	it("reports the land share it actually drew", () => {
		const grid = new CoarseGrid(LEVEL);
		const field = layeredHeight(grid, 1);
		let dry = 0;
		for (const h of field.raw) if (h > 0) dry++;
		expect(field.land).toBeCloseTo(dry / grid.count, 9);
	});
});

describe("erodeDroplets", () => {
	const grid = new CoarseGrid(LEVEL);
	const ground = (): Float64Array => layeredHeight(grid, 21).raw;
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
	 * what a spline is evaluated at, and a rounded one is a different world.
	 */
	const same = (options: CoarseMapOptions): void => {
		const whole = layeredHeight(grid, seed, options);
		const halves = shapeLayers(layerNoise(grid, seed, options), options);
		expect(halves.land).toBe(whole.land);
		for (let cell = 0; cell < grid.count; cell++) {
			expect(halves.raw[cell]).toBe(whole.raw[cell]);
			expect(halves.continent[cell]).toBe(whole.continent[cell]);
			expect(halves.erosion[cell]).toBe(whole.erosion[cell]);
			expect(halves.peaks[cell]).toBe(whole.peaks[cell]);
		}
	};

	it("gives the shipped world bit for bit", () => {
		same({});
	});

	it("gives a world with a layer switched off bit for bit", () => {
		same({ continentLayer: false });
		same({ erosionLayer: false });
		same({ peaksLayer: false });
	});

	it("gives a world with every metre knob moved bit for bit", () => {
		same({ relief: 1500, seaDepth: 700, peakRelief: 40, seaLevel: -60 });
	});
});
