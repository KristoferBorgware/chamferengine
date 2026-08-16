import { describe, expect, it } from "vitest";
import {
	CoarseGrid,
	accumulateFlow,
	buildCoarseMap,
	continentHeight,
	fillPits,
	routeFlow,
	seaLevelFor,
	seedFromString,
} from "chamfer/generation";

/** A map small enough to build several times in a test run. */
const LEVEL = 5;

/** How many cells drain through a channel before it is drawn as a river. */
const RIVER_THRESHOLD = 20;

describe("the coarse map", () => {
	it("leaves the intended fraction of the surface above sea level", () => {
		const map = buildCoarseMap(seedFromString("chamfer"), {
			level: LEVEL,
			landFraction: 0.3,
		});
		let land = 0;
		for (let cell = 0; cell < map.grid.count; cell++)
			if (map.height[cell]! > map.seaLevel) land++;
		// Erosion lowers land and never raises it, so the share ends up a little
		// under the target rather than on it.
		expect(land / map.grid.count).toBeGreaterThan(0.24);
		expect(land / map.grid.count).toBeLessThan(0.31);
	});

	it("gives the same map for the same seed", () => {
		const seed = seedFromString("chamfer");
		const a = buildCoarseMap(seed, { level: LEVEL });
		const b = buildCoarseMap(seed, { level: LEVEL });
		expect(a.seaLevel).toBe(b.seaLevel);
		for (let cell = 0; cell < a.grid.count; cell++) {
			expect(a.height[cell]).toBe(b.height[cell]);
			expect(a.water[cell]).toBe(b.water[cell]);
			expect(a.flow[cell]).toBe(b.flow[cell]);
		}
	});

	it("gives different maps for different seeds", () => {
		const a = buildCoarseMap(seedFromString("world1"), { level: LEVEL });
		const b = buildCoarseMap(seedFromString("world2"), { level: LEVEL });
		let same = 0;
		for (let cell = 0; cell < a.grid.count; cell++)
			if (a.height[cell] === b.height[cell]) same++;
		expect(same).toBe(0);
	});

	it("carries rivers, and every one of them reaches the sea", () => {
		// Level 7 rather than the level the rest of this file uses: a cell that
		// drains nowhere needs a basin with a long enough outlet chain to show
		// up, and small maps do not produce one.
		const map = buildCoarseMap(seedFromString("chamfer"), { level: 7 });
		const grid = map.grid;
		const surface = Float64Array.from(map.water);
		const down = routeFlow(grid, surface, map.seaLevel);

		let rivers = 0;
		let stranded = 0;
		for (let cell = 0; cell < grid.count; cell++) {
			if (map.height[cell]! <= map.seaLevel) continue;
			// Above sea level and draining nowhere is a drop of water with no
			// way out. Filling with a slope rather than flat is what takes this
			// to zero.
			if (down[cell]! < 0) stranded++;
			if (map.flow[cell]! >= RIVER_THRESHOLD) rivers++;
		}
		expect(stranded).toBe(0);
		expect(rivers).toBeGreaterThan(0);

		// Follow the largest channel down and require it to end in the ocean
		// rather than in a loop or a hole.
		let start = 0;
		for (let cell = 0; cell < grid.count; cell++)
			if (map.flow[cell]! > map.flow[start]!) start = cell;
		let at = start;
		let steps = 0;
		while (down[at]! >= 0 && steps <= grid.count) {
			at = down[at]!;
			steps++;
		}
		expect(steps).toBeLessThanOrEqual(grid.count);
		expect(map.height[at]!).toBeLessThanOrEqual(map.seaLevel);
	});

	it("makes rivers longer as the continents grow", () => {
		// A river cannot be longer than the land it crosses, so the continent
		// frequency is the control over river length. Raising it breaks the
		// surface into small blobs and the channels shorten with them.
		const longest = (continentFrequency: number) => {
			const map = buildCoarseMap(seedFromString("chamfer"), {
				level: LEVEL,
				continentFrequency,
			});
			const grid = map.grid;
			const surface = Float64Array.from(map.water);
			const down = routeFlow(grid, surface, map.seaLevel);
			const length = new Int32Array(grid.count);
			let best = 0;
			for (const cell of order(map)) {
				const next = down[cell]!;
				if (next < 0) continue;
				length[next] = Math.max(length[next]!, length[cell]! + 1);
				best = Math.max(best, length[next]!);
			}
			return best;
		};
		expect(longest(0.8)).toBeGreaterThan(longest(6));
	});

	it("floods a basin to a surface that stands above its floor", () => {
		const map = buildCoarseMap(seedFromString("chamfer"), { level: LEVEL });
		let lakes = 0;
		for (let cell = 0; cell < map.grid.count; cell++) {
			if (map.height[cell]! <= map.seaLevel) continue;
			expect(map.water[cell]!).toBeGreaterThanOrEqual(map.height[cell]!);
			if (map.water[cell]! > map.height[cell]!) lakes++;
		}
		expect(lakes).toBeGreaterThan(0);
	});
});

describe("seaLevelFor", () => {
	it("returns a level float32 holds exactly", () => {
		// The map is stored as float32 and "is this cell land" is asked of the
		// stored height, so a level float32 cannot hold rounds up under the one
		// cell sitting exactly on it. That cell then reads as land with nowhere
		// to drain -- one stranded cell on the whole planet, at every level.
		const grid = new CoarseGrid(4);
		for (const seed of [0, 1, 12345, 999]) {
			const height = continentHeight(grid, seed, 0.8, 4, 6, 5, 0.35);
			const seaLevel = seaLevelFor(height, 0.3);
			expect(Math.fround(seaLevel)).toBe(seaLevel);
		}
	});
});

describe("fillPits", () => {
	it("takes the count of cells with nowhere to go to zero", () => {
		const grid = new CoarseGrid(LEVEL);
		const height = continentHeight(grid, 1234, 0.8, 4, 6, 5, 0.35);
		const seaLevel = seaLevelFor(height, 0.3);

		let before = 0;
		const raw = routeFlow(grid, height, seaLevel);
		for (let cell = 0; cell < grid.count; cell++)
			if (height[cell]! > seaLevel && raw[cell]! < 0) before++;
		expect(before).toBeGreaterThan(0);

		const filled = fillPits(grid, height, seaLevel);
		const down = routeFlow(grid, filled, seaLevel);
		let after = 0;
		for (let cell = 0; cell < grid.count; cell++)
			if (filled[cell]! > seaLevel && down[cell]! < 0) after++;
		expect(after).toBe(0);
	});

	it("never lowers the ground", () => {
		const grid = new CoarseGrid(4);
		const height = continentHeight(grid, 99, 0.8, 4, 6, 5, 0.35);
		const seaLevel = seaLevelFor(height, 0.3);
		const filled = fillPits(grid, height, seaLevel);
		for (let cell = 0; cell < grid.count; cell++)
			expect(filled[cell]!).toBeGreaterThanOrEqual(height[cell]!);
	});
});

describe("accumulateFlow", () => {
	it("sums to one drainage count per land cell at the outlets", () => {
		const grid = new CoarseGrid(4);
		const height = continentHeight(grid, 7, 0.8, 4, 6, 5, 0.35);
		const seaLevel = seaLevelFor(height, 0.3);
		const filled = fillPits(grid, height, seaLevel);
		const down = routeFlow(grid, filled, seaLevel);
		const flow = accumulateFlow(grid, filled, down, seaLevel);

		let land = 0;
		let atOutlets = 0;
		for (let cell = 0; cell < grid.count; cell++) {
			if (filled[cell]! <= seaLevel) continue;
			land++;
			// A cell draining into the ocean carries everything above it, so the
			// outlets between them account for every land cell exactly once.
			if (filled[down[cell]!]! <= seaLevel) atOutlets += flow[cell]!;
		}
		expect(atOutlets).toBe(land);
	});
});

describe("sampling a fine cell", () => {
	it("returns the stored value at a cell the coarse map sits on", () => {
		const map = buildCoarseMap(seedFromString("chamfer"), { level: 4 });
		const depth = 7;
		const step = 1 << (depth - 4);
		for (const [face, i, j] of [
			[0, 0, 0],
			[3, 2, 5],
			[11, 7, 1],
			[19, 4, 4],
		] as const) {
			const cell = map.grid.indexOf(face, i, j);
			expect(map.heightAt(face, i * step, j * step, depth)).toBeCloseTo(
				map.height[cell]!,
				6,
			);
		}
	});

	it("stays between the coarse samples it mixes", () => {
		const map = buildCoarseMap(seedFromString("chamfer"), { level: 4 });
		const depth = 7;
		const step = 1 << (depth - 4);
		const n = map.grid.n;
		for (let i = 0; i < n; i++)
			for (let j = 0; i + j < n; j++) {
				const corners = [
					map.height[map.grid.indexOf(0, i, j)]!,
					map.height[map.grid.indexOf(0, i + 1, j)]!,
					map.height[map.grid.indexOf(0, i, j + 1)]!,
					map.height[map.grid.indexOf(0, i + 1, j + 1)]!,
				];
				const lo = Math.min(...corners);
				const hi = Math.max(...corners);
				for (const [di, dj] of [
					[1, 1],
					[step - 1, 1],
					[step >> 1, step >> 1],
				] as const) {
					const v = map.heightAt(
						0,
						i * step + di,
						j * step + dj,
						depth,
					);
					expect(v).toBeGreaterThanOrEqual(lo - 1e-6);
					expect(v).toBeLessThanOrEqual(hi + 1e-6);
				}
			}
	});
});

/** Every land cell of a map, highest water surface first. */
function order(map: {
	grid: { count: number };
	water: Float32Array;
	height: Float32Array;
	seaLevel: number;
}): number[] {
	const cells: number[] = [];
	for (let cell = 0; cell < map.grid.count; cell++)
		if (map.height[cell]! > map.seaLevel) cells.push(cell);
	return cells.sort((a, b) => map.water[b]! - map.water[a]! || a - b);
}
