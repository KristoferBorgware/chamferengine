import { describe, expect, it } from "vitest";
import {
	COARSE_FIELDS,
	CoarseGrid,
	buildCoarseMap,
	coarseSlope,
	continentHeight,
	seedFromString,
} from "chamfer/generation";

/** Every way the map can decide where its land is. */
const LANDFORMS = ["noise", "warped", "grown", "plates"] as const;

const percentile = (values: Float32Array, p: number): number => {
	const sorted = Float64Array.from(values).sort();
	return sorted[Math.floor(p * (sorted.length - 1))]!;
};

describe("coarseSlope", () => {
	it("gives the same ground the same steepness at two map levels", () => {
		// The drop to a neighbour halves at every finer level because the step
		// does, so a raw drop describes a different planet at every map size:
		// the same ground read 0.047, 0.025 and 0.012 at levels 6, 7 and 8.
		// Dividing the step out is what makes one ramp, one material rule and
		// one spawn test mean the same thing on every map.
		const seed = seedFromString("chamfer");
		const median = (level: number): number => {
			const grid = new CoarseGrid(level);
			const height = continentHeight(grid, seed, 0.8, 4, 6, 5, 0.35);
			return percentile(coarseSlope(grid, height), 0.5);
		};
		const coarse = median(6);
		const fine = median(7);
		expect(Math.abs(fine - coarse) / coarse).toBeLessThan(0.1);
	});

	it("is zero everywhere on ground that does not move", () => {
		const grid = new CoarseGrid(4);
		const flat = new Float64Array(grid.count).fill(0.25);
		for (const v of coarseSlope(grid, flat)) expect(v).toBe(0);
	});
});

describe("every landform stands where the terrain ramp can draw it", () => {
	// A field measured from sea level is drawn on a ramp that runs to 0.35
	// either side of it. Ground past that end is not merely clipped -- it is
	// flat, so a whole mountain range or a whole continent comes out as one
	// solid white slab with its shape gone. Plates ran to 2.70 and drew a
	// quarter of the planet that way.
	const RAMP = COARSE_FIELDS.find((f) => f.key === "height")!.ramp.high;

	for (const landform of LANDFORMS)
		it(`keeps most of ${landform} inside it`, () => {
			const map = buildCoarseMap(seedFromString("chamfer"), {
				landform,
				level: 5,
			});
			const above = Float32Array.from(
				map.height,
				(v) => Math.abs(v - map.seaLevel) / RAMP,
			);
			// Half the planet inside the ramp, and the far tail within three
			// times it. All four sit at 0.28 to 0.53 and 1.31 to 2.08 here, so
			// this catches a landform whose scale has drifted rather than one
			// that grew a taller mountain.
			expect(percentile(above, 0.5)).toBeLessThan(1);
			expect(percentile(above, 0.99)).toBeLessThan(3);
		});
});
