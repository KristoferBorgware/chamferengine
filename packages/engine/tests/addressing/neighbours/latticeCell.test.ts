import { describe, expect, it } from "vitest";
import {
	barycentricOf,
	hexRound,
	latticeCell,
	latticePosition,
	neighbour,
} from "chamfer/addressing";

const DEPTH = 11;
const N = 2 ** DEPTH;

describe("an extended lattice coordinate", () => {
	it("is the cell itself inside the triangle", () => {
		expect(latticeCell(7, N, 900, 700)).toEqual({
			face: 7,
			i: 900,
			j: 700,
		});
	});

	it("names the cells over an edge that a walk reaches", () => {
		// Walking off the face renames the point on the other face; counting
		// past the edge in this face's own coordinates has to name the same
		// cells, or the chart a light is filled in cannot carry it over an
		// edge at all. The direction index is not the same on both sides, so
		// the walk is compared against the chart rather than followed in it.
		let walked = { face: 4, i: 1000, j: 0 };
		let chart = { i: 1000, j: 0 };
		for (let step = 0; step < 24; step++) {
			const next = neighbour(walked.face, N, walked.i, walked.j, 4);
			expect(next).not.toBeNull();
			walked = next!;
			// Which chart step the walk took, read off the point itself.
			const dir = latticePosition(walked.face, N, walked.i, walked.j);
			const w = barycentricOf(4, dir);
			const [, i, j] = hexRound(N * w[0], N * w[1], N * w[2], N);
			chart = { i, j };
			expect(latticeCell(4, N, chart.i, chart.j)).toEqual(walked);
		}
		// The walk really did leave the face, or the test proves nothing.
		expect(walked.face).not.toBe(4);
	});

	it("round-trips every point of a neighbourhood straddling an edge", () => {
		// What a fragment shader does: solve a direction into the light's own
		// face and read the chart. Every cell within reach of a light near an
		// edge has to come back to itself.
		const reach = 16;
		for (let di = -reach; di <= reach; di++)
			for (let dj = -reach; dj <= reach; dj++) {
				const i = 1000 + di;
				const j = 4 + dj;
				const cell = latticeCell(4, N, i, j);
				const dir = latticePosition(cell.face, N, cell.i, cell.j);
				const w = barycentricOf(4, dir);
				const [, ri, rj] = hexRound(N * w[0], N * w[1], N * w[2], N);
				// Adding zero, because rounding a small negative gives `-0`
				// and a coordinate of zero is one number, not two.
				expect({ i: ri + 0, j: rj + 0 }).toEqual({ i, j });
			}
	});
});
