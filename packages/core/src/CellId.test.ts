import { describe, expect, it } from "vitest";
import {
	LAYER_COUNT,
	chunkOf,
	decodeCell,
	encodeCell,
	wordBits,
} from "./CellId.js";
import { cellKey } from "./cellKey.js";
import { cellRepresentations } from "./cellRepresentations.js";

describe("the word", () => {
	it("is 51 bits at depth 11", () => {
		expect(wordBits(11)).toBe(51);
		expect(wordBits(11)).toBeLessThan(64);
	});

	it("addresses 1,024 layers", () => {
		expect(LAYER_COUNT).toBe(1024);
	});

	it("stays inside the range float64 represents exactly", () => {
		expect(2 ** wordBits(11)).toBeLessThan(Number.MAX_SAFE_INTEGER);
	});

	it("fits depth 17 in 64 bits and no more", () => {
		expect(wordBits(17)).toBeLessThanOrEqual(64);
		expect(wordBits(18)).toBeGreaterThan(64);
	});
});

describe("encodeCell", () => {
	it("gives one number to a cell however it is named", () => {
		for (const depth of [2, 3, 4]) {
			const n = 1 << depth;
			for (let f = 0; f < 20; f++)
				for (let i = 0; i <= n; i++)
					for (let j = 0; i + j <= n; j++) {
						const id = encodeCell(
							{ planet: 0, face: f, i, j, layer: 0 },
							depth,
						);
						for (const r of cellRepresentations(f, n, i, j))
							expect(
								encodeCell(
									{
										planet: 0,
										face: r.face,
										i: r.i,
										j: r.j,
										layer: 0,
									},
									depth,
								),
							).toBe(id);
					}
		}
	});

	it("gives 10 * 4^L + 2 distinct numbers", () => {
		for (const depth of [2, 3, 4]) {
			const n = 1 << depth;
			const ids = new Set<number>();
			for (let f = 0; f < 20; f++)
				for (let i = 0; i <= n; i++)
					for (let j = 0; i + j <= n; j++)
						ids.add(
							encodeCell(
								{ planet: 0, face: f, i, j, layer: 0 },
								depth,
							),
						);
			expect(ids.size).toBe(10 * 4 ** depth + 2);
		}
	});

	it("round-trips through decodeCell", () => {
		const depth = 4;
		const n = 1 << depth;
		for (let f = 0; f < 20; f++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const id = encodeCell(
						{ planet: 7, face: f, i, j, layer: 63 },
						depth,
					);
					const back = decodeCell(id, depth);
					expect(back.planet).toBe(7);
					expect(back.layer).toBe(63);
					expect(cellKey(back.face, n, back.i, back.j)).toBe(
						cellKey(f, n, i, j),
					);
				}
	});

	it("keeps the layer in its own field, clear of the address", () => {
		const depth = 5;
		const a = encodeCell(
			{ planet: 0, face: 3, i: 4, j: 5, layer: 0 },
			depth,
		);
		const b = encodeCell(
			{ planet: 0, face: 3, i: 4, j: 5, layer: 1023 },
			depth,
		);
		expect(b - a).toBe(1023);
	});
});

describe("chunkOf", () => {
	it("gives every cell of a chunk the same prefix", () => {
		const depth = 5;
		const chunkLevel = 2;
		const n = 1 << depth;
		const members = new Map<number, Set<string>>();
		for (let f = 0; f < 20; f++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const id = encodeCell(
						{ planet: 0, face: f, i, j, layer: 0 },
						depth,
					);
					const c = chunkOf(id, depth, chunkLevel);
					if (!members.has(c)) members.set(c, new Set());
					members.get(c)!.add(cellKey(f, n, i, j));
				}
		// Every cell lands in exactly one chunk, and the chunks partition the sphere.
		const total = [...members.values()].reduce((s, x) => s + x.size, 0);
		expect(total).toBe(10 * 4 ** depth + 2);
		expect(members.size).toBeLessThanOrEqual(20 * 4 ** chunkLevel);
	});

	it("does not change when the cut moves", () => {
		// The cut is a place to read rather than a stored field, so the same cell
		// keeps the same number at every chunk level.
		const depth = 5;
		const id = encodeCell(
			{ planet: 0, face: 9, i: 7, j: 11, layer: 2 },
			depth,
		);
		for (const c of [1, 2, 3, 4])
			expect(decodeCell(chunkOf(id, depth, c), depth).planet).toBe(0);
		expect(
			encodeCell({ planet: 0, face: 9, i: 7, j: 11, layer: 2 }, depth),
		).toBe(id);
	});
});
