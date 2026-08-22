import { describe, expect, it } from "vitest";
import {
	DIRECTIONS,
	acrossEdge,
	latticePosition,
	latticeWeights,
	neighbour,
} from "chamfer/addressing";

/**
 * The reflection that writes a point under the neighbouring face's name.
 *
 * `neighbour` runs it for one integer lattice step. A droplet needs the same
 * rule for a position that is not on a lattice point and for a direction, and
 * the map is linear, so it has to hold for both.
 */
const LEVEL = 3;
const N = 1 << LEVEL;

describe("acrossEdge", () => {
	it("names the same cell a lattice step off a face lands on", () => {
		let crossings = 0;
		for (let face = 0; face < 20; face++)
			for (let i = 0; i <= N; i++)
				for (let j = 0; i + j <= N; j++) {
					// A step off a face from an icosahedron vertex lands past
					// the vertex rather than over an edge, and one reflection
					// leaves a weight still negative. Those twelve read their
					// own ring instead.
					const w = latticeWeights(N, i, j);
					if (w.filter((x) => x === 0).length >= 2) continue;
					for (let k = 0; k < 6; k++) {
						const [di, dj] = DIRECTIONS[k]!;
						const ni = i + di;
						const nj = j + dj;
						const out = latticeWeights(N, ni, nj);
						const negative = out.findIndex((x) => x < 0);
						if (negative < 0) continue;
						crossings++;
						const over = acrossEdge(face, out, negative);
						expect(over).toEqual(neighbour(face, N, i, j, k));
					}
				}
		expect(crossings).toBeGreaterThan(400);
	});

	it("leaves a point standing on the edge exactly where it stood", () => {
		// The weight being left is zero there, which is where the two faces
		// agree. Fractions along the edge, because the rule has to hold for a
		// position between lattice points.
		for (let face = 0; face < 20; face++)
			for (let leaving = 0; leaving < 3; leaving++)
				for (let step = 1; step < 8; step++) {
					const along = (step * N) / 8;
					const weights: [number, number, number] = [0, 0, 0];
					weights[leaving] = 0;
					weights[((leaving + 1) % 3) as 0 | 1 | 2] = N - along;
					weights[((leaving + 2) % 3) as 0 | 1 | 2] = along;
					const over = acrossEdge(face, weights, leaving);
					const before = latticePosition(
						face,
						N,
						weights[1],
						weights[2],
					);
					const after = latticePosition(over.face, N, over.i, over.j);
					expect(after.x).toBeCloseTo(before.x, 12);
					expect(after.y).toBeCloseTo(before.y, 12);
					expect(after.z).toBeCloseTo(before.z, 12);
				}
	});

	it("carries a direction into the face on the other side", () => {
		// A step straight off an edge has to arrive pointing inward, which is a
		// weight growing on the far face's own third vertex, by exactly what
		// the vertex left behind lost.
		for (let face = 0; face < 20; face++)
			for (let leaving = 0; leaving < 3; leaving++) {
				const walk: [number, number, number] = [0, 0, 0];
				walk[leaving] = -1;
				walk[((leaving + 1) % 3) as 0 | 1 | 2] = 0.5;
				walk[((leaving + 2) % 3) as 0 | 1 | 2] = 0.5;
				const over = acrossEdge(face, walk, leaving);
				const carried = [-over.i - over.j, over.i, over.j];
				expect(carried[0]! + carried[1]! + carried[2]!).toBeCloseTo(
					0,
					12,
				);
				expect(Math.max(...carried)).toBeCloseTo(1, 12);
			}
	});

	it("round-trips: crossing back is crossing forward undone", () => {
		for (let face = 0; face < 20; face++)
			for (let leaving = 0; leaving < 3; leaving++) {
				const weights: [number, number, number] = [0, 0, 0];
				weights[leaving] = 0;
				weights[((leaving + 1) % 3) as 0 | 1 | 2] = N * 0.4;
				weights[((leaving + 2) % 3) as 0 | 1 | 2] = N * 0.6;
				const over = acrossEdge(face, weights, leaving);
				const there: [number, number, number] = [
					N - over.i - over.j,
					over.i,
					over.j,
				];
				// The vertex the far face gained is the one to leave going back,
				// and its weight is zero, so the point does not move either way.
				const back = acrossEdge(
					over.face,
					there,
					there.findIndex((x) => Math.abs(x) < 1e-12),
				);
				expect(back.face).toBe(face);
				expect(back.i).toBeCloseTo(weights[1], 12);
				expect(back.j).toBeCloseTo(weights[2], 12);
			}
	});
});
