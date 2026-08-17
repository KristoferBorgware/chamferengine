import { describe, expect, it } from "vitest";
import {
	TerrainGenerator,
	flatCoarseMap,
	seedFromString,
} from "chamfer/generation";
import { WorldShape } from "chamfer/world";

const LEVEL = 5;

describe("flatCoarseMap", () => {
	it("carries the right topology and nothing else", () => {
		const map = flatCoarseMap(seedFromString("chamfer"), LEVEL);
		expect(map.level).toBe(LEVEL);
		expect(map.count).toBe(10 * 4 ** LEVEL + 2);
		expect(map.seaLevel).toBe(0);
		for (let cell = 0; cell < map.count; cell++) {
			expect(map.height[cell]).toBe(0);
			expect(map.water[cell]).toBe(0);
			expect(map.flow[cell]).toBe(0);
			expect(map.slope[cell]).toBe(0);
		}
	});

	it("carries the seed, for a worker that reads its seed off the map", () => {
		const seed = seedFromString("chamfer");
		expect(flatCoarseMap(seed, LEVEL).seed).toBe(seed);
	});

	it("gives the terrain generator pure noise and no water", () => {
		const seed = seedFromString("chamfer");
		const map = flatCoarseMap(seed, LEVEL);
		const shape = new WorldShape(1700, 8, 60, 200);
		const gen = new TerrainGenerator(seed, shape, map, {
			detailAmplitude: 20,
		});

		let sawRelief = false;
		for (let face = 0; face < 20; face += 3)
			for (let i = 0; i <= shape.n; i += 16)
				for (let j = 0; i + j <= shape.n; j += 16) {
					const column = gen.columnAt(face, i, j);
					// The coarse term is zero everywhere, so elevation is the
					// detail term alone, bounded by construction to the
					// amplitude asked for.
					expect(Math.abs(column.elevation)).toBeLessThanOrEqual(20);
					if (Math.abs(column.elevation) > 1) sawRelief = true;
					// Ground and water coincide everywhere: nothing is wet.
					expect(column.waterRadius).toBe(column.groundRadius);
					expect(column.catchment).toBe(0);
				}
		expect(sawRelief).toBe(true);
	});
});
