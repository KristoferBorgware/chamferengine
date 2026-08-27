import { describe, expect, it } from "vitest";
import { skyExposure } from "chamfer/light";

/** Six neighbours, which is what a hexagon has and what a ring walk gives. */
function ring(...layers: number[]): number[] {
	return layers;
}

/** Every neighbour standing `above` layers over this face. */
function shutIn(above: number): number[] {
	return ring(-above, -above, -above, -above, -above, -above);
}

const REACH = 6;
const FLOOR = 0.12;

describe("how much sky a face sees", () => {
	it("gives an open face all of it, bounce or no bounce", () => {
		// Nothing above, so nothing is blocked, so there is nothing for a
		// bounce to have intercepted. The term has to leave the open sky
		// alone or every hillside brightens for a reason nobody asked for.
		const flat = ring(0, 0, 0, 0, 0, 0);
		expect(skyExposure(0, flat, REACH, FLOOR, 0)).toBe(1);
		expect(skyExposure(0, flat, REACH, FLOOR, 0.35)).toBe(1);
	});

	it("is bit-for-bit the old reading at a bounce of zero", () => {
		// The switch has to reach all the way off. Anything that survived at
		// zero would be a change nobody could turn off, in a term baked into
		// every vertex of the world.
		for (const above of [1, 2, 4, 8, 16, 40]) {
			const around = shutIn(above);
			const plain = skyExposure(0, around, REACH, FLOOR);
			expect(skyExposure(0, around, REACH, FLOOR, 0)).toBe(plain);
		}
	});

	it("floors a shut-in face flat without a bounce", () => {
		// The whole complaint: once every direction is blocked there is
		// nothing left to vary, so a shaft reads the same at its mouth and
		// forty layers down.
		const lip = skyExposure(0, shutIn(8), REACH, FLOOR, 0);
		const deep = skyExposure(0, shutIn(40), REACH, FLOOR, 0);
		expect(lip).toBeCloseTo(FLOOR, 10);
		expect(deep).toBeCloseTo(FLOOR, 10);
		expect(deep).toBe(lip);
	});

	it("lights the mouth of a hollow more than its bottom", () => {
		// What the bounce buys. A blocked direction points at a lit surface,
		// and how much of that surface this face can see falls off as the
		// blocker rises -- so the gradient runs the right way and every depth
		// is a different number again.
		const bounce = 0.35;
		const depths = [1, 2, 4, 8, 16, 40];
		const seen = depths.map((d) =>
			skyExposure(0, shutIn(d), REACH, FLOOR, bounce),
		);
		for (let n = 1; n < seen.length; n++)
			expect(seen[n]!).toBeLessThan(seen[n - 1]!);
		// And every one of them is brighter than the flat floor it replaces.
		for (const value of seen) expect(value).toBeGreaterThan(FLOOR);
	});

	it("never sends back more than was intercepted", () => {
		// A surface that returned more than it took would make the world feed
		// itself, and a shut-in face brighter than an open one.
		for (const above of [1, 3, 6, 12, 30]) {
			const lit = skyExposure(0, shutIn(above), REACH, FLOOR, 1);
			expect(lit).toBeLessThanOrEqual(1);
			expect(lit).toBeLessThan(
				skyExposure(0, ring(0, 0, 0, 0, 0, 0), REACH, FLOOR, 1),
			);
		}
	});

	it("rises with the share a surface gives back", () => {
		const around = shutIn(6);
		const none = skyExposure(0, around, REACH, FLOOR, 0);
		const some = skyExposure(0, around, REACH, FLOOR, 0.35);
		const most = skyExposure(0, around, REACH, FLOOR, 0.8);
		expect(some).toBeGreaterThan(none);
		expect(most).toBeGreaterThan(some);
	});

	it("leaves ground below it alone", () => {
		// Only what stands over a face can block it or bounce into it. A
		// cliff edge with a drop on three sides is not a hollow.
		const below = ring(5, 5, 5, 5, 5, 5);
		expect(skyExposure(0, below, REACH, FLOOR, 0.35)).toBe(1);
	});
});
