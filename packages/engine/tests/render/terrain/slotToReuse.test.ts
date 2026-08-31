import { describe, expect, it } from "vitest";
import { slotToReuse } from "chamfer/render";

describe("slotToReuse", () => {
	// Taking back a picture something is drawing turns a textured block flat
	// while somebody is looking at it, which is worse than the crowding it
	// relieves.
	it("never takes a slot holding a picture on screen", () => {
		const slot = slotToReuse(
			[1, 2, 3],
			[10, 11, 12],
			new Set([10, 11, 12]),
		);
		expect(slot).toBe(-1);
	});

	it("takes the one named longest ago", () => {
		const slot = slotToReuse([9, 2, 7], [10, 11, 12], new Set());
		expect(slot).toBe(1);
	});

	it("passes over what is on screen to reach an older one behind it", () => {
		// Slot 0 is the oldest but is being drawn, so slot 2 goes instead.
		const slot = slotToReuse([1, 8, 4], [10, 11, 12], new Set([10]));
		expect(slot).toBe(2);
	});

	// A pool genuinely too small for one view: the new picture draws as its own
	// average colour, which is what happened before there was any eviction.
	it("gives up rather than evicting something visible", () => {
		expect(slotToReuse([1], [10], new Set([10]))).toBe(-1);
	});
});
