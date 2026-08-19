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
			expect(percentile(above, 0.5)).toBeLessThan(1);
			expect(percentile(above, 0.99)).toBeLessThan(3);
		});
});
