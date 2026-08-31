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
	GRID_CELLS,
	RISE_BANDS,
	RISE_EDGES,
	SHORE_ROOM,
	riseGrid,
	bucket,
	gridAt,
	landformAt,
} from "chamfer/generation";

describe("the landform grid", () => {
	it("holds one digit per band combination, every one a landform", () => {
		expect(DEFAULT_LANDFORM_GRID.length).toBe(
			CONT_BANDS * RISE_BANDS * ERO_BANDS * PV_BANDS,
		);
		expect(GRID_CELLS).toBe(DEFAULT_LANDFORM_GRID.length);
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
		expect(gridAt(0, 0, ERO_BANDS - 1, PV_BANDS - 1)).toBe(
			ERO_BANDS * PV_BANDS - 1,
		);
		expect(gridAt(0, 1, 0, 0)).toBe(ERO_BANDS * PV_BANDS);
	});
});

describe("landformAt", () => {
	const grid = DEFAULT_LANDFORM_GRID;

	/** The height band a reading of `rise` falls in, for a readable call. */
	const HIGH = 0.9;
	const LOW = 0.05;

	it("names the sea with -1, whatever the fields say", () => {
		expect(landformAt(1, 1, 1, HIGH, 0, 6, 12, grid)).toBe(-1);
		expect(landformAt(0, 0, 0, LOW, -40, 6, 12, grid)).toBe(-1);
	});

	it("names a beach only where the low ground has room to be one", () => {
		// Low and roomy is shore; low against a hillside falls through to the
		// grid, so the foot of a cliff is not a beach.
		expect(landformAt(0.5, 0.5, 0.5, LOW, 5, SHORE_ROOM, 12, grid)).toBe(
			SHORE,
		);
		expect(
			landformAt(0.5, 0.5, 0.5, LOW, 5, SHORE_ROOM - 1, 12, grid),
		).not.toBe(SHORE);
	});

	it("is a height rule, so a mountain near the coast is never shore", () => {
		expect(landformAt(0.9, 0.1, 0.9, HIGH, 800, 6, 12, grid)).not.toBe(
			SHORE,
		);
	});

	it("reads the grid at the four bucketed readings", () => {
		const level = 0.9;
		const cut = 0.1;
		const swing = 0.9;
		const expected = Number(
			grid[
				gridAt(
					bucket(level, CONT_EDGES),
					bucket(HIGH, RISE_EDGES),
					bucket(cut, ERO_EDGES),
					bucket(swing, PV_EDGES),
				)
			],
		);
		expect(landformAt(level, cut, swing, HIGH, 500, 0, 12, grid)).toBe(
			expected,
		);
	});

	// **The reason the fourth axis exists.** The first three are shape and
	// say how sharp a place is, never how far above the sea it ends up, so
	// one reading named a summit and a small steep butte alike -- and the
	// grounds filed to peaks are bare rock and snow. The height band is what
	// separates them, and it is written in the grid rather than corrected
	// after it.
	it("gives the same sharp reading a peak high up and a slope low down", () => {
		expect(landformAt(0.9, 0.1, 0.9, HIGH, 500, 0, 12, grid)).toBe(5);
		expect(landformAt(0.9, 0.1, 0.9, LOW, 40, 0, 12, grid)).toBe(3);
	});

	// Worn ground high up is a plateau and the same worn ground low down is
	// lowland, which is the other half of what the axis buys.
	it("gives the same worn reading a plateau high up and lowland low down", () => {
		expect(landformAt(0.9, 0.9, 0.9, HIGH, 500, 0, 12, grid)).toBe(4);
		expect(landformAt(0.9, 0.9, 0.9, LOW, 40, 0, 12, grid)).toBe(2);
	});

	it("names every cell of the grid a real landform", () => {
		expect(grid.length).toBe(GRID_CELLS);
		for (const digit of grid) {
			const form = Number(digit);
			expect(Number.isInteger(form)).toBe(true);
			expect(form).toBeGreaterThanOrEqual(0);
			expect(form).toBeLessThan(LANDFORMS.length);
		}
	});
});

describe("riseGrid", () => {
	// **A link is a world.** A grid written before the height axis named a
	// world, and repeating its sheets across the new axis is the only
	// reading that leaves that world exactly as it was: the new axis then
	// decides nothing, which is what it decided before.
	it("spreads a grid written before the axis across every height band", () => {
		const flat = "133" + "223" + "222" + "135" + "124" + "224";
		const spread = riseGrid(flat)!;
		expect(spread.length).toBe(GRID_CELLS);
		for (let cont = 0; cont < CONT_BANDS; cont++)
			for (let rise = 0; rise < RISE_BANDS; rise++)
				for (let ero = 0; ero < ERO_BANDS; ero++)
					for (let pv = 0; pv < PV_BANDS; pv++)
						expect(spread[gridAt(cont, rise, ero, pv)]).toBe(
							flat[(cont * ERO_BANDS + ero) * PV_BANDS + pv],
						);
	});

	it("hands back a grid that already has the axis, and refuses anything else", () => {
		expect(riseGrid(DEFAULT_LANDFORM_GRID)).toBe(DEFAULT_LANDFORM_GRID);
		expect(riseGrid("12")).toBe(null);
		expect(riseGrid("")).toBe(null);
	});
});
