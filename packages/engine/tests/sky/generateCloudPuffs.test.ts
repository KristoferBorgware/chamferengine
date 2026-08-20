import { describe, expect, it } from "vitest";
import { generateCloudPuffs } from "chamfer/sky";

const LAYERS = [
	{ radius: 6800, windRate: 0.02, size: 64, spread: 180, thickness: 70 },
	{ radius: 7200, windRate: 0.012, size: 45, spread: 130, thickness: 40 },
];

describe("where the billboard clouds sit", () => {
	it("gives every puff a unit direction and a deck's own placement", () => {
		const puffs = generateCloudPuffs(42, 300, 40, LAYERS);
		expect(puffs.length).toBeGreaterThan(0);
		for (const puff of puffs) {
			const length = Math.sqrt(
				puff.direction.x ** 2 +
					puff.direction.y ** 2 +
					puff.direction.z ** 2,
			);
			expect(length).toBeCloseTo(1, 9);
			const layer = LAYERS.find((l) => l.windRate === puff.windRate);
			expect(layer).toBeDefined();
			// Lifted off its deck's radius, never further than its thickness.
			expect(Math.abs(puff.radius - layer!.radius)).toBeLessThanOrEqual(
				layer!.thickness + 1e-9,
			);
			expect(puff.cover).toBeGreaterThan(0);
			expect(puff.size).toBeGreaterThan(0);
			expect(puff.shade).toBeGreaterThan(0);
			expect(puff.shade).toBeLessThanOrEqual(1);
		}
	});

	it("builds formations, so puffs stand many to a neighbourhood", () => {
		// The point of a cluster: a puff's nearest neighbour is a fraction of
		// its own size away, not the kilometre a lone scatter would leave.
		const puffs = generateCloudPuffs(42, 300, 40, [LAYERS[0]!]);
		expect(puffs.length).toBeGreaterThan(1000);

		const first = puffs[0]!;
		let closest = Infinity;
		for (let n = 1; n < Math.min(400, puffs.length); n++) {
			const other = puffs[n]!;
			const away =
				first.direction.sub(other.direction).length() * first.radius;
			closest = Math.min(closest, away);
		}
		expect(closest).toBeLessThan(LAYERS[0]!.size);
	});

	it("is the same sky for the same seed, and another for a different one", () => {
		const a = generateCloudPuffs(7, 200, 20, LAYERS);
		const b = generateCloudPuffs(7, 200, 20, LAYERS);
		expect(a).toEqual(b);

		const c = generateCloudPuffs(8, 200, 20, LAYERS);
		expect(c.length).not.toBe(a.length);
	});

	it("leaves out every formation the coverage field does not reach", () => {
		// One candidate per deck is the whole of the sphere spread, so a deck
		// either passes the floor or contributes nothing at all.
		const puffs = generateCloudPuffs(42, 1, 20, LAYERS);
		expect(puffs.length % 20 === 0 || puffs.length === 0).toBe(true);
	});
});
