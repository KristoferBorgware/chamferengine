import { describe, expect, it } from "vitest";
import type { CaveVolume } from "../src/caveVolume.js";
import { AIR, CUT, ROCK, VOID } from "../src/CaveBlock.js";
import { caveSpans } from "../src/caveSpans.js";

/** One block, so a layer index and a height are the same number. */
const BLOCK = 1;

/**
 * A volume of one column, written top down the way the walk writes it.
 *
 * The top entry stands at layer `top`, so the height of the boundary under
 * entry `L` is `top - L` and the one over it is `top - L + 1`.
 */
function column(top: number, ...kinds: number[]): CaveVolume {
	return {
		count: 1,
		layers: kinds.length,
		blockMetres: BLOCK,
		kind: Uint8Array.from(kinds),
		topLayer: Int32Array.of(top),
		surface: Float64Array.of(top + 0.4),
		raw: new Float32Array(1),
		continent: new Float32Array(1),
		erosion: new Float32Array(1),
		peaks: new Float32Array(1),
		carve: new Float32Array(1),
		ceiling: new Float32Array(1),
		lookups: 0,
		ms: 0,
	};
}

/** One column's runs, as plain pairs. */
function runs(volume: CaveVolume, draw: "rock" | "void"): number[] {
	const ground = caveSpans(volume, draw);
	return Array.from(ground.spans.slice(ground.at[0]!, ground.at[1]!));
}

describe("a walked column as runs of heights", () => {
	it("is one pair where nothing was carved", () => {
		// Air over four blocks of rock, standing at layers 6 down to 3.
		expect(
			runs(
				column(10, AIR, AIR, AIR, AIR, ROCK, ROCK, ROCK, ROCK),
				"rock",
			),
		).toEqual([3, 7]);
	});

	it("is three pairs where a cave runs through it", () => {
		// Rock, one block of cave, rock again: the shape one number could not
		// hold at all.
		expect(
			runs(column(10, AIR, ROCK, ROCK, VOID, ROCK, ROCK), "rock"),
		).toEqual([5, 7, 8, 10]);
	});

	it("counts a block the cliffs layer took as open, not as rock", () => {
		expect(runs(column(10, AIR, CUT, ROCK, ROCK), "rock")).toEqual([7, 9]);
	});

	it("draws the caves as the solid, standing on a floor", () => {
		// The deepest entry stands at layer `top - layers + 1`, and the floor
		// is one block of it -- so the void's own runs all have a bottom cap.
		const spans = runs(
			column(10, AIR, ROCK, VOID, VOID, ROCK, ROCK),
			"void",
		);
		expect(spans.slice(0, 2)).toEqual([5, 6]);
		expect(spans.slice(2)).toEqual([7, 9]);
	});

	it("joins the floor to a passage standing on it", () => {
		// A cave reaching the bottom of the walk shares a boundary with the
		// floor block, and two runs that meet are one run.
		expect(runs(column(10, AIR, ROCK, ROCK, VOID, VOID), "void")).toEqual([
			6, 8,
		]);
	});

	it("reports the top of the topmost run as the column's height", () => {
		const ground = caveSpans(
			column(10, AIR, AIR, ROCK, ROCK, ROCK, ROCK),
			"rock",
		);
		expect(ground.height[0]).toBe(9);
	});

	it("falls back to the ground where every block was carved away", () => {
		const volume = column(10, AIR, CUT, CUT, CUT);
		const ground = caveSpans(volume, "rock");
		expect(ground.at[1]).toBe(0);
		expect(ground.height[0]).toBe(volume.surface[0]);
	});
});
