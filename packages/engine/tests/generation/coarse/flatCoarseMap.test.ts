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
		for (let cell = 0; cell < map.count; cell++)
			expect(map.height[cell]).toBe(0);
	});

	it("carries the seed, for a worker that reads its seed off the map", () => {
		const seed = seedFromString("chamfer");
		expect(flatCoarseMap(seed, LEVEL).seed).toBe(seed);
	});

	it("gives the terrain generator a sphere at sea level", () => {
		// Zero metres everywhere is exactly sea level, so the world is a
		// smooth ball with water standing on it and no ground anywhere. That is
		// the whole of the pause: there is no second term left to leave running.
		const seed = seedFromString("chamfer");
		const map = flatCoarseMap(seed, LEVEL);
		const shape = new WorldShape(1700, 8, 60, 200);
		const gen = new TerrainGenerator(seed, shape, map);

		for (let face = 0; face < 20; face += 3)
			for (let i = 0; i <= shape.n; i += 16)
				for (let j = 0; i + j <= shape.n; j += 16) {
					const column = gen.columnAt(face, i, j);
					expect(column.elevation).toBe(0);
					expect(column.groundRadius).toBe(shape.seaLevelRadius);
					expect(column.waterRadius).toBe(column.groundRadius);
				}
	});
});
