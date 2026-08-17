import { describe, expect, it } from "vitest";
import { stickVector } from "../src/stickVector.js";

const RADIUS = 60;

describe("stickVector", () => {
	it("reads nothing from a thumb resting in the middle", () => {
		// Without a dead zone the player creeps whenever a finger is down,
		// because a thumb is never exactly centred.
		expect(stickVector(0, 0, RADIUS)).toEqual({ ahead: 0, aside: 0 });
		expect(stickVector(3, -2, RADIUS)).toEqual({ ahead: 0, aside: 0 });
	});

	it("points forward when the thumb goes up the screen", () => {
		// Screen y grows downward and forward is up.
		const up = stickVector(0, -RADIUS, RADIUS);
		expect(up.ahead).toBeCloseTo(1, 9);
		expect(up.aside).toBeCloseTo(0, 9);

		const down = stickVector(0, RADIUS, RADIUS);
		expect(down.ahead).toBeCloseTo(-1, 9);

		const right = stickVector(RADIUS, 0, RADIUS);
		expect(right.aside).toBeCloseTo(1, 9);
		expect(right.ahead).toBeCloseTo(0, 9);
	});

	it("starts at zero as it leaves the dead zone rather than jumping", () => {
		// A thumb crossing the threshold must not lurch into motion.
		const edge = stickVector(0, -RADIUS * 0.1201, RADIUS);
		expect(edge.ahead).toBeGreaterThan(0);
		expect(edge.ahead).toBeLessThan(0.02);
	});

	it("is analog, so a thumb near the middle creeps", () => {
		const near = stickVector(0, -RADIUS * 0.4, RADIUS);
		const far = stickVector(0, -RADIUS * 0.9, RADIUS);
		expect(near.ahead).toBeGreaterThan(0);
		expect(near.ahead).toBeLessThan(far.ahead);
		expect(far.ahead).toBeLessThan(1);
	});

	it("never reads past full speed, however far the thumb slides", () => {
		// A finger dragged off the pad keeps its direction and stops gaining.
		for (const out of [1, 2, 8]) {
			const v = stickVector(RADIUS * out, -RADIUS * out, RADIUS);
			expect(Math.hypot(v.ahead, v.aside)).toBeCloseTo(1, 9);
		}
	});
});
