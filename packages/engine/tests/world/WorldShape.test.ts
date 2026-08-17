import { describe, expect, it } from "vitest";
import { CELL_CONSTANT, WorldShape, maxCrustDepth } from "chamfer/world";

describe("WorldShape", () => {
	it("puts 1 m blocks on the worked planet", () => {
		// Radius 1,700 m at depth 11 is the sizing every measured number in the
		// specification is quoted against.
		const shape = new WorldShape(1700, 11, 150, 435);
		expect(shape.blockSize).toBeCloseTo(1, 3);
		expect(shape.cellCount).toBe(41943042);
		expect(shape.n).toBe(2048);
	});

	it("derives block size from radius and depth", () => {
		for (const depth of [4, 8, 11, 14]) {
			const shape = new WorldShape(1700, depth, 150, 64);
			expect(shape.blockSize).toBeCloseTo(
				(CELL_CONSTANT * 1700) / 2 ** depth,
				12,
			);
		}
	});

	it("round-trips a layer through its radius", () => {
		const shape = new WorldShape(1700, 11, 150, 435);
		for (const layer of [0, 1, 150, 434]) {
			const mid = shape.radiusOfLayer(layer) - shape.blockSize * 0.5;
			expect(shape.layerOfRadius(mid)).toBe(layer);
		}
	});

	it("agrees with layerOfRadius about a surface away from the boundaries", () => {
		const shape = new WorldShape(1700, 11, 150, 435);
		for (const radius of [1700.3, 1699.7, 1600.1, 1849.5]) {
			expect(shape.layerOfSurface(radius)).toBe(
				shape.layerOfRadius(radius) + 1,
			);
		}
	});

	it("tops a surface landing exactly on a boundary at that boundary", () => {
		// The other rounding put the first solid block one whole layer down,
		// which a sphere with no relief hits at every column: the walkable
		// surface of the whole planet sat one block below the radius the
		// generator named, and a viewer standing on it stood under the horizon
		// formula's reference sphere.
		const shape = new WorldShape(1700, 11, 150, 435);
		for (const layer of [1, 2, 150]) {
			const boundary = shape.radiusOfLayer(layer);
			expect(shape.layerOfSurface(boundary)).toBe(layer);
		}
	});

	it("stacks layers downward from a fixed crust top", () => {
		const shape = new WorldShape(1700, 11, 150, 435);
		expect(shape.radiusOfLayer(0)).toBe(1850);
		expect(shape.crustTopRadius - shape.radiusOfLayer(1)).toBeCloseTo(
			shape.blockSize,
			12,
		);
		// Sea level is a radius, so it lands on one layer everywhere on the
		// planet rather than following the ground.
		expect(shape.seaLevelLayer).toBe(150);
	});
});

describe("maxCrustDepth", () => {
	it("caps the crust at 435 layers at depth 11", () => {
		expect(maxCrustDepth(11)).toBe(435);
	});

	it("caps the crust at a fixed share of the radius, whatever the radius", () => {
		// The radius cancels out of (1 - 0.744) * 2^depth / K, so the cap is a
		// property of the subdivision depth. The crust it allows is the same
		// 25.6% of the planet at every size.
		for (const radius of [400, 1700, 6371000])
			for (const depth of [8, 11, 14]) {
				const shape = new WorldShape(radius, depth, 0, 1);
				const reach = (maxCrustDepth(depth) * shape.blockSize) / radius;
				expect(reach).toBeCloseTo(0.256, 2);
			}
	});

	it("stays under the 1,024 the layer field addresses below depth 13", () => {
		expect(maxCrustDepth(12)).toBeLessThan(1024);
		expect(maxCrustDepth(13)).toBeGreaterThan(1024);
	});
});
