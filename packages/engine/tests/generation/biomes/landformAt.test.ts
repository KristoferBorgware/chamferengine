import { describe, expect, it } from "vitest";
import {
	CONT_BANDS,
	CONT_EDGES,
	DEFAULT_LANDFORM_GRID,
	ERO_BANDS,
	ERO_EDGES,
	LANDFORMS,
	PV_BANDS,
	PV_EDGES,
	SHORE,
	SHORE_ROOM,
	bucket,
	gridAt,
	landformAt,
} from "chamfer/generation";

describe("the landform grid", () => {
	it("holds one digit per band combination, every one a landform", () => {
		expect(DEFAULT_LANDFORM_GRID.length).toBe(
			CONT_BANDS * ERO_BANDS * PV_BANDS,
		);
		for (const digit of DEFAULT_LANDFORM_GRID) {
			const form = Number(digit);
			expect(Number.isInteger(form)).toBe(true);
			expect(form).toBeGreaterThanOrEqual(0);
			expect(form).toBeLessThan(LANDFORMS.length);
		}
	});

	it("buckets a reading by ascending edges, ends included", () => {
		expect(bucket(-1, CONT_EDGES)).toBe(0);
		expect(bucket(0.69, CONT_EDGES)).toBe(0);
		expect(bucket(0.7, CONT_EDGES)).toBe(1);
		expect(bucket(2, ERO_EDGES)).toBe(ERO_BANDS - 1);
		expect(bucket(0.5, PV_EDGES)).toBe(1);
	});

	it("indexes the grid sheet by sheet, row by row", () => {
		// The last cell of the first sheet sits right before the second sheet.
		expect(gridAt(0, ERO_BANDS - 1, PV_BANDS - 1)).toBe(
			ERO_BANDS * PV_BANDS - 1,
		);
		expect(gridAt(1, 0, 0)).toBe(ERO_BANDS * PV_BANDS);
	});
});

describe("landformAt", () => {
	const grid = DEFAULT_LANDFORM_GRID;

	it("names the sea with -1, whatever the fields say", () => {
		expect(landformAt(1, 1, 1, 0, 6, 12, grid)).toBe(-1);
		expect(landformAt(0, 0, 0, -40, 6, 12, grid)).toBe(-1);
	});

	it("names a beach only where the low ground has room to be one", () => {
		// Low and roomy is shore; low against a hillside falls through to the
		// grid, so the foot of a cliff is not a beach.
		expect(landformAt(0.5, 0.5, 0.5, 5, SHORE_ROOM, 12, grid)).toBe(SHORE);
		expect(landformAt(0.5, 0.5, 0.5, 5, SHORE_ROOM - 1, 12, grid)).not.toBe(
			SHORE,
		);
	});

	it("is a height rule, so a mountain near the coast is never shore", () => {
		expect(landformAt(0.9, 0.1, 0.9, 800, 6, 12, grid)).not.toBe(SHORE);
	});

	it("reads the grid at the three bucketed readings", () => {
		const level = 0.9;
		const cut = 0.1;
		const swing = 0.9;
		const expected = Number(
			grid[
				gridAt(
					bucket(level, CONT_EDGES),
					bucket(cut, ERO_EDGES),
					bucket(swing, PV_EDGES),
				)
			],
		);
		expect(landformAt(level, cut, swing, 500, 0, 12, grid)).toBe(expected);
	});

	it("puts sharp high inland relief in the peaks and worn ground low", () => {
		// Inland, sharp erosion band, peak relief band: the grid's tallest cell.
		expect(landformAt(0.9, 0.1, 0.9, 500, 0, 12, grid)).toBe(5);
		// Worn ground is lowland or plateau wherever it is.
		expect([2, 4]).toContain(landformAt(0.9, 0.9, 0.5, 500, 0, 12, grid));
	});
});
