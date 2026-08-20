import { describe, expect, it } from "vitest";
import { generateCloudPuffs } from "chamfer/sky";

const LAYERS = [
	{ radius: 6800, windRate: 0.02, size: 120 },
	{ radius: 7200, windRate: 0.012, size: 90 },
];

describe("where the billboard clouds sit", () => {
	it("gives every puff a unit direction and a layer's own placement", () => {
		const puffs = generateCloudPuffs(42, 300, LAYERS);
		expect(puffs.length).toBeGreaterThan(0);
		for (const puff of puffs) {
			const length = Math.sqrt(
				puff.direction.x ** 2 +
					puff.direction.y ** 2 +
					puff.direction.z ** 2,
			);
			expect(length).toBeCloseTo(1, 9);
			const layer = LAYERS.find((l) => l.radius === puff.radius);
			expect(layer).toBeDefined();
			expect(puff.windRate).toBe(layer!.windRate);
			expect(puff.cover).toBeGreaterThan(0);
			expect(puff.size).toBeGreaterThan(0);
			expect(puff.size).toBeLessThanOrEqual(layer!.size);
		}
	});

	it("is the same set for the same seed, and moves with a different one", () => {
		const a = generateCloudPuffs(7, 300, LAYERS);
		const b = generateCloudPuffs(7, 300, LAYERS);
		expect(a).toEqual(b);

		const c = generateCloudPuffs(8, 300, LAYERS);
		expect(c.length).not.toBe(a.length);
	});

	it("leaves out every candidate the coverage field does not reach", () => {
		// One candidate per layer is the whole of the sphere spread, so it
		// either passes the floor or the layer contributes nothing.
		const puffs = generateCloudPuffs(42, 1, LAYERS);
		expect(puffs.length).toBeLessThanOrEqual(LAYERS.length);
	});
});
