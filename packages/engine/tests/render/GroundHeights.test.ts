import { describe, expect, it } from "vitest";
import { GroundHeights } from "chamfer/render";
import { flatCoarseMap } from "chamfer/generation";
import type { CoarseMap } from "chamfer/generation";
import { RecordingGpu } from "./recordingGpu.js";

/** A map at the smallest level there is, with heights written by hand. */
function mapWith(peak: number, at: number): CoarseMap {
	const map = flatCoarseMap(1, 1);
	// Under sea level everywhere else, so the peak is the only reading that
	// can decide the ceiling.
	map.height.fill(-40);
	map.height[at] = peak;
	return map;
}

describe("what bounds a walk toward the sun", () => {
	it("takes the ceiling from the map's own tallest reading", () => {
		// The ceiling is what makes the walk affordable: a point above it
		// cannot have ground between itself and the sun whatever direction the
		// sun is in, so nothing above it walks at all and a walk from below it
		// stops there. Read from the map rather than from a knob, because what
		// bounds it is the ground this world actually has.
		const gpu = new RecordingGpu();
		const heights = new GroundHeights(gpu.context);

		heights.upload(mapWith(613, 7), 1700);

		expect(heights.seaRadius).toBe(1700);
		expect(heights.ceilingRadius).toBe(1700 + 613 + 1);
	});

	it("puts the ceiling at sea level for a world with no land", () => {
		// An all-ocean map has no ground standing over the water at all, so
		// the ceiling is sea level and every sample in the air is above it.
		const gpu = new RecordingGpu();
		const heights = new GroundHeights(gpu.context);

		heights.upload(mapWith(-5, 3), 1700);

		expect(heights.ceilingRadius).toBe(1701);
	});

	it("starts with the walk switched off, before any map is uploaded", () => {
		// A binding a pipeline declares has to be filled from the first frame,
		// and the first frames of a session are drawn while the map is still
		// being built. Strength zero is what the shader tests first.
		const gpu = new RecordingGpu();
		const heights = new GroundHeights(gpu.context);

		expect(heights.ceilingRadius).toBe(0);
		expect(heights.seaRadius).toBe(0);
	});
});
