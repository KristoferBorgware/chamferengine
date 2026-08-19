import { describe, expect, it } from "vitest";
import {
	COARSE_FIELDS,
	LANDFORMS,
	buildCoarseMap,
	seedFromString,
} from "chamfer/generation";

const percentile = (values: Float32Array, p: number): number => {
	const sorted = Float64Array.from(values).sort();
	return sorted[Math.floor(p * (sorted.length - 1))]!;
};

describe("every landform lands inside the terrain ramp", () => {
	// The map's colors are absolute metres, so a landform whose scale has
	// drifted does not merely clip -- it draws flat, and a whole mountain range
	// or a whole continent comes out as one solid slab with its shape gone.
	// Plates once ran to 2.70 where the ramp reached 0.35 and drew a quarter of
	// the planet that way.
	const RAMP = COARSE_FIELDS.find((f) => f.key === "height")!.ramp.high;

	for (const landform of LANDFORMS)
		it(`keeps most of ${landform} inside it`, () => {
			const map = buildCoarseMap(seedFromString("chamfer"), {
				landform,
				level: 5,
				cellMetres: 800,
				relief: 600,
			});
			const above = Float32Array.from(
				map.height,
				(v) => Math.abs(v) / RAMP,
			);
			// Half the planet inside the ramp, and the far tail within three and
			// a half times it. Measured with nothing eroding them, the four sit
			// at 0.30 to 0.72 in the middle and 1.23 to 3.03 at the 99th, so
			// this catches a landform whose scale has drifted -- plates once
			// ran to eight times the ramp -- rather than one that grew a taller
			// mountain.
			expect(percentile(above, 0.5)).toBeLessThan(1);
			expect(percentile(above, 0.99)).toBeLessThan(3.5);
		});
});
