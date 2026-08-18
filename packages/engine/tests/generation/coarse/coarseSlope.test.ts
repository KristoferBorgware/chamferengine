import { describe, expect, it } from "vitest";
import {
	COARSE_FIELDS,
	CoarseGrid,
	LANDFORMS,
	buildCoarseMap,
	coarseSlope,
	metreHeight,
	noiseHeight,
	seedFromString,
} from "chamfer/generation";

const percentile = (values: Float32Array, p: number): number => {
	const sorted = Float64Array.from(values).sort();
	return sorted[Math.floor(p * (sorted.length - 1))]!;
};

describe("coarseSlope", () => {
	it("gives the same ground the same steepness at two map levels", () => {
		// The drop to a neighbour halves at every finer level because the step
		// does, so a raw drop describes a different planet at every map size:
		// the same ground read 0.047, 0.025 and 0.012 at levels 6, 7 and 8.
		// Dividing by the step in metres is what makes one ramp, one material
		// rule and one spawn test mean the same thing on every map.
		const median = (level: number): number => {
			const grid = new CoarseGrid(level);
			const cell = 25600 / 2 ** level;
			const height = metreHeight(
				noiseHeight(grid, 21, 1.5, 4, 0.5, 2, 0, 0),
				0.3,
				600,
			);
			return percentile(coarseSlope(grid, height, cell), 0.5);
		};
		const coarse = median(6);
		const fine = median(7);
		expect(Math.abs(fine - coarse) / coarse).toBeLessThan(0.1);
	});

	it("is zero everywhere on ground that does not move", () => {
		const grid = new CoarseGrid(4);
		const flat = new Float64Array(grid.count).fill(0.25);
		for (const v of coarseSlope(grid, flat, 100)) expect(v).toBe(0);
	});
});

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
