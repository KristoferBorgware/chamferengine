import { describe, expect, it } from "vitest";
import {
	COARSE_FIELDS,
	NOISE_BASES,
	buildCoarseMap,
	seedFromString,
} from "chamfer/generation";

const percentile = (values: Float32Array, p: number): number => {
	const sorted = Float64Array.from(values).sort();
	return sorted[Math.floor(p * (sorted.length - 1))]!;
};

describe("every noise basis lands inside the terrain ramp", () => {
	// The map's colors are absolute metres, so a basis whose scale has drifted
	// does not merely clip -- it draws flat, and a whole mountain range or a
	// whole continent comes out as one solid slab with its shape gone.
	const RAMP = COARSE_FIELDS.find((f) => f.key === "height")!.ramp.high;

	for (const basis of NOISE_BASES)
		it(`keeps most of ${basis} inside it`, () => {
			const map = buildCoarseMap(seedFromString("chamfer"), {
				basis,
				level: 5,
				cellMetres: 800,
				relief: 600,
			});
			const above = Float32Array.from(
				map.height,
				(v) => Math.abs(v) / RAMP,
			);
			// Half the planet inside the ramp, and the far tail within three
			// and a half times it. This catches a basis whose own normaliser
			// has drifted, rather than one that grew a taller mountain: the
			// metre scale divides by the field's own peak, so a basis that
			// reached ten times its stated range would still put its summit at
			// the asked-for relief and give itself away here instead.
			expect(percentile(above, 0.5)).toBeLessThan(1);
			expect(percentile(above, 0.99)).toBeLessThan(3.5);
		});
});
