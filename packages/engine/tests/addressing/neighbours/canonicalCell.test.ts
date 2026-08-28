import { describe, expect, it } from "vitest";
import {
	canonicalCell,
	cellRepresentations,
	latticeWeights,
} from "chamfer/addressing";

/**
 * `canonicalCell` returns early for a cell strictly inside its own face, which
 * is better than 97% of them, and the early answer has to be the answer the
 * search would have given.
 *
 * The guard is three comparisons standing in for a walk of twenty faces, so
 * what these check is not that it is fast but that it is the same: the whole
 * lattice at a level small enough to enumerate, every point, against the search
 * run in full.
 */

/** The search, written out, which is what the function did before the guard. */
function bySearch(
	face: number,
	n: number,
	i: number,
	j: number,
): { face: number; i: number; j: number } {
	const all = cellRepresentations(face, n, i, j);
	let best = all[0]!;
	for (const c of all) if (c.face < best.face) best = c;
	return best;
}

/** Every face-and-offset pair on the planet at one subdivision. */
function* everyCell(n: number): Generator<[number, number, number]> {
	for (let face = 0; face < 20; face++)
		for (let i = 0; i <= n; i++)
			for (let j = 0; i + j <= n; j++) yield [face, i, j];
}

describe("canonicalCell", () => {
	it.each([1, 2, 4, 8])(
		"gives what the full search gives, at every cell of level n = %d",
		(n) => {
			let checked = 0;
			for (const [face, i, j] of everyCell(n)) {
				const here = canonicalCell(face, n, i, j);
				const there = bySearch(face, n, i, j);
				expect(here, `face ${face} (${i}, ${j}) at n ${n}`).toEqual(
					there,
				);
				checked++;
			}
			expect(checked).toBe((20 * ((n + 1) * (n + 2))) / 2);
		},
	);

	it("takes the early answer exactly where no weight is zero", () => {
		const n = 8;
		let inside = 0;
		let shared = 0;
		for (const [face, i, j] of everyCell(n)) {
			const zero = latticeWeights(n, i, j).some((w) => w === 0);
			// The guard rests on one implication and this is it: a cell with a
			// second name always has a zero weight, so a cell with none is
			// named by its own face and by nothing else.
			if (cellRepresentations(face, n, i, j).length > 1)
				expect(
					zero,
					`face ${face} (${i}, ${j}) has a second name`,
				).toBe(true);
			if (zero) shared++;
			else {
				inside++;
				expect(canonicalCell(face, n, i, j)).toEqual({ face, i, j });
			}
		}
		// `3n` of a face's `(n+1)(n+2)/2` points sit on an edge, which is what
		// makes the guard worth having rather than merely correct.
		expect(shared).toBe(20 * 3 * n);
		expect(inside).toBe(20 * (((n + 1) * (n + 2)) / 2 - 3 * n));
	});

	it("still reaches a lower face across an edge and at a vertex", () => {
		const n = 8;
		// An edge point of a high-numbered face has a second name, and the rule
		// is the lowest face among them -- so at least one of these has to move.
		let moved = 0;
		for (const [face, i, j] of everyCell(n)) {
			if (!latticeWeights(n, i, j).some((w) => w === 0)) continue;
			if (canonicalCell(face, n, i, j).face !== face) moved++;
		}
		expect(moved).toBeGreaterThan(0);
		// The twelve pentagons are the cells with two zero weights, and each is
		// named by the five faces meeting at its vertex.
		const vertices = new Set<number>();
		for (const [face, i, j] of everyCell(n)) {
			if (latticeWeights(n, i, j).filter((w) => w === 0).length !== 2)
				continue;
			expect(cellRepresentations(face, n, i, j)).toHaveLength(5);
			const c = canonicalCell(face, n, i, j);
			vertices.add((c.face * (n + 1) + c.i) * (n + 1) + c.j);
		}
		expect(vertices.size).toBe(12);
	});
});
