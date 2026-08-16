import { describe, expect, it } from "vitest";
import { Vec3 } from "chamfer/math";
import {
	cellKey,
	latticePosition,
	neighbour,
	opposite,
} from "chamfer/addressing";

/**
 * The adjacency graph built from geometry: every cell, and the six or five
 * nearest others. This is what `neighbour` has to agree with, and it is built a
 * completely different way — positions, distances and a hash of rounded
 * coordinates.
 */
function geometricGraph(depth: number) {
	const n = 1 << depth;
	const byKey = new Map<
		string,
		{ pos: ReturnType<typeof latticePosition>; near: string[] }
	>();
	for (let f = 0; f < 20; f++)
		for (let i = 0; i <= n; i++)
			for (let j = 0; i + j <= n; j++) {
				const k = cellKey(f, n, i, j);
				if (!byKey.has(k))
					byKey.set(k, {
						pos: latticePosition(f, n, i, j),
						near: [],
					});
			}
	const keys = [...byKey.keys()];
	for (const a of keys) {
		const pa = byKey.get(a)!.pos;
		const d = keys
			.filter((b) => b !== a)
			.map((b) => [b, byKey.get(b)!.pos.sub(pa).length()] as const)
			.sort((p, q) => p[1] - q[1]);
		const closest = d[0]![1];
		byKey.get(a)!.near = d
			.filter(([, x]) => x < closest * 1.35)
			.map(([b]) => b);
	}
	return byKey;
}

describe("neighbour", () => {
	it("agrees with the graph built from geometry at depth 2", () => {
		const depth = 2;
		const n = 1 << depth;
		const graph = geometricGraph(depth);
		for (let f = 0; f < 20; f++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const mine = new Set<string>();
					for (let k = 0; k < 6; k++) {
						const nb = neighbour(f, n, i, j, k);
						if (nb) mine.add(cellKey(nb.face, n, nb.i, nb.j));
					}
					const truth = new Set(graph.get(cellKey(f, n, i, j))!.near);
					expect([...mine].sort()).toEqual([...truth].sort());
				}
	});

	it("steps back to where it started", () => {
		const depth = 4;
		const n = 1 << depth;
		let checked = 0;
		for (let f = 0; f < 20; f++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const here = cellKey(f, n, i, j);
					for (let k = 0; k < 6; k++) {
						const nb = neighbour(f, n, i, j, k);
						if (!nb) continue;
						// A pentagon's ring is not indexed by the six lattice
						// directions, so the return step is found rather than
						// computed from k.
						let returned = false;
						for (let k2 = 0; k2 < 6; k2++) {
							const back = neighbour(nb.face, n, nb.i, nb.j, k2);
							if (
								back &&
								cellKey(back.face, n, back.i, back.j) === here
							)
								returned = true;
						}
						expect(returned).toBe(true);
						checked++;
					}
				}
		expect(checked).toBeGreaterThan(0);
	});

	it("uses k + 3 as the return step away from the pentagons", () => {
		const depth = 4;
		const n = 1 << depth;
		let checked = 0;
		for (let f = 0; f < 20; f++)
			for (let i = 1; i < n; i++)
				for (let j = 1; i + j < n; j++) {
					for (let k = 0; k < 6; k++) {
						const nb = neighbour(f, n, i, j, k)!;
						const back = neighbour(
							nb.face,
							n,
							nb.i,
							nb.j,
							opposite(k),
						)!;
						expect(cellKey(back.face, n, back.i, back.j)).toBe(
							cellKey(f, n, i, j),
						);
						checked++;
					}
				}
		expect(checked).toBeGreaterThan(1000);
	});
});
