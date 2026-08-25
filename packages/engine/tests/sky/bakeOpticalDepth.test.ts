import { describe, expect, it } from "vitest";
import { bakeOpticalDepth, planetAtmosphere } from "chamfer/sky";

const RADIUS = 1700;
const AIR = planetAtmosphere(RADIUS, {
	wavelengths: [700, 530, 460],
	scatteringStrength: 21.23,
	densityFalloff: 4.3,
	atmosphereScale: 0.322,
	intensity: 1,
	mieStrength: 0,
	mieDirection: 0.76,
});

const SIZE = 64;
const STEPS = 12;

/**
 * **[measured]** `u = 0` is straight out from the sample point -- the
 * shortest path to the edge of the air at any height -- and `u = 1` is
 * straight toward the planet's own centre, which travels through the whole
 * body and out the far side of the shell rather than stopping at the ground.
 * Nothing here tests solid rock, only where the outer shell is, so a texel
 * near `u = 1` at a low height is a real number and a very large one: at the
 * surface it runs from 97 at `u = 0` to 3,488 at `u = 1` over 16 columns,
 * smooth and monotone the whole way rather than jumping at either end.
 */
describe("the baked optical-depth table", () => {
	it("is finite and never negative anywhere on the table", () => {
		const table = bakeOpticalDepth(AIR, STEPS, SIZE);
		for (const value of table.data) {
			expect(Number.isFinite(value)).toBe(true);
			expect(value).toBeGreaterThanOrEqual(0);
		}
	});

	it("reaches zero at the top of the air, looking straight out", () => {
		// height01 = 1 is the very top of the shell; a ray straight out from
		// there (u = 0) leaves immediately, so there is no air left ahead of
		// it to integrate.
		const table = bakeOpticalDepth(AIR, STEPS, SIZE);
		const topRow = SIZE - 1;
		expect(table.data[topRow * SIZE + 0]).toBeCloseTo(0, 6);
	});

	it("grows monotonically from straight out to straight in, at the ground", () => {
		const table = bakeOpticalDepth(AIR, STEPS, SIZE);
		let previous = 0;
		for (let col = 0; col < SIZE; col++) {
			const value = table.data[col]!;
			expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
			previous = value;
		}
		expect(previous).toBeGreaterThan(table.data[0]! * 10);
	});

	it("holds less air overhead the higher up the table looks, straight out", () => {
		// Whatever the angle, a point already high up has less shell left
		// ahead of it than the same angle from the ground.
		const table = bakeOpticalDepth(AIR, STEPS, SIZE);
		let previous = Infinity;
		for (let row = 0; row < SIZE; row++) {
			const value = table.data[row * SIZE]!;
			expect(value).toBeLessThanOrEqual(previous + 1e-9);
			previous = value;
		}
	});

	it("keeps the same shape at a finer resolution, only sampled more precisely", () => {
		const table = bakeOpticalDepth(AIR, STEPS, SIZE * 2);
		const size = table.size;
		expect(table.data[(size - 1) * size]).toBeCloseTo(0, 6);
		expect(table.data[size - 1]).toBeGreaterThan(table.data[0]! * 10);
	});
});
