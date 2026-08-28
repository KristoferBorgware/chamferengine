import { describe, expect, it } from "vitest";
import type { CaveVolume } from "../src/caveVolume.js";
import type { ColumnPatch } from "chamfer/mesh";
import { AIR, CUT, ROCK, VOID } from "../src/CaveBlock.js";
import { Vec3 } from "chamfer/math";
import { measureCaves } from "../src/measureCaves.js";

/**
 * A row of columns, each its own neighbour's neighbour.
 *
 * Only the ring and the degree are read, so the rest of a patch stands in as
 * whatever is cheapest -- what is being tested is the walk over the ring, not
 * where the cells are.
 */
function row(count: number): ColumnPatch {
	const ring = new Int32Array(count * 6).fill(-1);
	for (let c = 0; c < count; c++) {
		// Direction 0 forward, direction 3 back: the lattice's own opposite
		// pair, so a width walk along one axis runs the whole row.
		if (c + 1 < count) ring[c * 6] = c + 1;
		if (c > 0) ring[c * 6 + 3] = c - 1;
	}
	return {
		count,
		level: 1,
		face: new Int32Array(count),
		i: new Int32Array(count),
		j: new Int32Array(count),
		directions: new Float64Array(count * 3),
		degree: new Uint8Array(count).fill(6),
		corner: new Float64Array(count * 18),
		ring,
		centre: new Vec3(0, 1, 0),
		whole: false,
	};
}

/** A volume over that row: one list of block kinds a column, top first. */
function volume(tops: number[], kinds: number[][]): CaveVolume {
	const count = tops.length;
	const layers = kinds[0]!.length;
	const kind = new Uint8Array(count * layers);
	for (let c = 0; c < count; c++) kind.set(kinds[c]!, c * layers);
	return {
		count,
		layers,
		blockMetres: 1,
		kind,
		topLayer: Int32Array.from(tops),
		surface: Float64Array.from(tops.map((t) => t + 0.4)),
		raw: new Float32Array(count),
		continent: new Float32Array(count),
		erosion: new Float32Array(count),
		peaks: new Float32Array(count),
		carve: new Float32Array(count),
		ceiling: new Float32Array(count),
		lookups: 0,
		ms: 0,
	};
}

describe("what a patch of caves came to", () => {
	it("counts a cave under rock and the column it is in", () => {
		const found = measureCaves(
			row(1),
			volume([9], [[AIR, ROCK, VOID, ROCK]]),
		);
		expect(found.caveCells).toBe(1);
		expect(found.caveColumns).toBe(1);
		expect(found.multiSpan).toBe(1);
	});

	it("calls it a mouth only where nothing solid stands over it", () => {
		const shut = measureCaves(row(1), volume([9], [[AIR, ROCK, VOID]]));
		expect(shut.mouths).toBe(0);
		const open = measureCaves(row(1), volume([9], [[AIR, VOID, ROCK]]));
		expect(open.mouths).toBe(1);
		// A block the cliffs layer took is a hole in a hillside, so a passage
		// under one is still a way in.
		const through = measureCaves(row(1), volume([9], [[AIR, CUT, VOID]]));
		expect(through.mouths).toBe(1);
	});

	it("joins two columns by world layer, not by index", () => {
		// Two columns a block apart in height, with one cave block each at the
		// **same world layer** -- entry 1 of the taller and entry 0 of the
		// shorter. Joined by index they would be two systems.
		const stepped = measureCaves(
			row(2),
			volume(
				[9, 8],
				[
					[ROCK, VOID, ROCK],
					[VOID, ROCK, ROCK],
				],
			),
		);
		expect(stepped.caveCells).toBe(2);
		expect(stepped.systems).toBe(1);
		expect(stepped.largest).toBe(2);
	});

	it("keeps two caves that never touch apart", () => {
		const apart = measureCaves(
			row(2),
			volume(
				[9, 9],
				[
					[AIR, VOID, ROCK, ROCK],
					[AIR, ROCK, ROCK, VOID],
				],
			),
		);
		expect(apart.systems).toBe(2);
		expect(apart.half).toBe(1);
	});

	it("reports the narrowest run through a passage, in cells", () => {
		// Three columns in a row, all with a cave: along the ring that is a run
		// of three, and across the two axes with no neighbours it is one.
		const found = measureCaves(
			row(3),
			volume(
				[9, 9, 9],
				[
					[AIR, VOID],
					[AIR, VOID],
					[AIR, VOID],
				],
			),
		);
		expect(found.medianWidth).toBe(1);
		expect(found.thinShare).toBe(1);
	});

	it("charges the caves only for the faces they opened", () => {
		// One cave block in the middle of a column: a cap under the rock over
		// it, a cap over the rock under it, and six sides against nothing --
		// but the two neighbours are off the patch and stand in as filled.
		const found = measureCaves(
			row(1),
			volume([9], [[AIR, ROCK, VOID, ROCK]]),
		);
		expect(found.faces - found.facesBare).toBe(2);
	});
});
