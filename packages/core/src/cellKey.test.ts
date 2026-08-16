import { describe, expect, it } from "vitest";
import { cellKey } from "./cellKey.js";
import { cellRepresentations, canonicalCell } from "./cellRepresentations.js";
import { degree } from "./neighbour.js";

/** Every distinct cell at a subdivision level, keyed by face-independent identity. */
function allCells(depth: number): Set<string> {
	const n = 1 << depth;
	const out = new Set<string>();
	for (let f = 0; f < 20; f++)
		for (let i = 0; i <= n; i++)
			for (let j = 0; i + j <= n; j++) out.add(cellKey(f, n, i, j));
	return out;
}

describe("cellKey", () => {
	it("counts 10 * 4^L + 2 cells at every level", () => {
		for (const depth of [1, 2, 3, 4, 5]) {
			expect(allCells(depth).size).toBe(10 * 4 ** depth + 2);
		}
	});

	it("gives one key to every face that names a shared cell", () => {
		const depth = 4;
		const n = 1 << depth;
		for (let f = 0; f < 20; f++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const key = cellKey(f, n, i, j);
					for (const r of cellRepresentations(f, n, i, j))
						expect(cellKey(r.face, n, r.i, r.j)).toBe(key);
				}
	});

	it("gives an interior cell one representation and a vertex five", () => {
		const depth = 4;
		const n = 1 << depth;
		expect(cellRepresentations(0, n, 5, 5)).toHaveLength(1);
		// (0, 0) is vertex A of face 0, where five faces meet.
		expect(cellRepresentations(0, n, 0, 0)).toHaveLength(5);
		// A point on an edge but not a vertex belongs to two faces.
		expect(cellRepresentations(0, n, 5, 0)).toHaveLength(2);
	});

	it("picks the same canonical face from every representation", () => {
		const depth = 4;
		const n = 1 << depth;
		for (let f = 0; f < 20; f++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const c = canonicalCell(f, n, i, j);
					for (const r of cellRepresentations(f, n, i, j)) {
						const c2 = canonicalCell(r.face, n, r.i, r.j);
						expect(c2).toEqual(c);
					}
				}
	});
});

describe("degree", () => {
	it("gives exactly twelve cells five neighbours and the rest six", () => {
		for (const depth of [2, 3, 4]) {
			const n = 1 << depth;
			const fives = new Set<string>();
			let sixes = 0;
			for (let f = 0; f < 20; f++)
				for (let i = 0; i <= n; i++)
					for (let j = 0; i + j <= n; j++) {
						const d = degree(f, n, i, j);
						if (d === 5) fives.add(cellKey(f, n, i, j));
						else {
							expect(d).toBe(6);
							sixes++;
						}
					}
			expect(fives.size).toBe(12);
			expect(sixes).toBeGreaterThan(0);
		}
	});
});
