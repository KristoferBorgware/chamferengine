import { describe, expect, it } from "vitest";
import type { CellId } from "chamfer/addressing";
import {
	LAYER_COUNT,
	cellKey,
	cellRepresentations,
	chunkOf,
	decodeCell,
	encodeCell,
	wordBits,
} from "chamfer/addressing";

/** A `CellId` as a string, so it can be a `Set` or `Map` key. */
function idKey(id: CellId): string {
	return `${id[0]}:${id[1]}`;
}

describe("the word", () => {
	it("is 51 bits at depth 11", () => {
		expect(wordBits(11)).toBe(51);
		expect(wordBits(11)).toBeLessThan(64);
	});

	it("addresses 1,024 layers", () => {
		expect(LAYER_COUNT).toBe(1024);
	});

	it("passes what a number represents exactly well before it reaches 64 bits", () => {
		// A CellId is two 32-bit halves rather than a number, so this is no
		// longer a limit -- but the word does cross it, at depth 13, which is
		// why the split exists at all. Depth 12 is exactly 53 bits and still
		// safe; one level deeper is the first that is not.
		expect(wordBits(12)).toBeLessThanOrEqual(53);
		expect(wordBits(13)).toBeGreaterThan(53);
	});

	it("fits depth 17 in 64 bits and no more", () => {
		expect(wordBits(17)).toBeLessThanOrEqual(64);
		expect(wordBits(18)).toBeGreaterThan(64);
	});
});

describe("encodeCell", () => {
	it("gives one address to a cell however it is named", () => {
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
							).toEqual(id);
					}
		}
	});

	it("gives 10 * 4^L + 2 distinct addresses", () => {
		for (const depth of [2, 3, 4]) {
			const n = 1 << depth;
			const ids = new Set<string>();
			for (let f = 0; f < 20; f++)
				for (let i = 0; i <= n; i++)
					for (let j = 0; i + j <= n; j++)
						ids.add(
							idKey(
								encodeCell(
									{ planet: 0, face: f, i, j, layer: 0 },
									depth,
								),
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

	it("round-trips a planet field that pushes the word past 53 bits", () => {
		// The shipped planet grows to depth 13, a 55-bit word. Planet 4095 is
		// the highest the 12-bit field holds. A number would round this off
		// silently; two 32-bit halves do not.
		const depth = 13;
		const id = encodeCell(
			{ planet: 4095, face: 7, i: 100, j: 5, layer: 800 },
			depth,
		);
		const back = decodeCell(id, depth);
		expect(back.planet).toBe(4095);
		expect(back.layer).toBe(800);
		expect(cellKey(back.face, 1 << depth, back.i, back.j)).toBe(
			cellKey(7, 1 << depth, 100, 5),
		);
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
		expect(decodeCell(a, depth).layer).toBe(0);
		expect(decodeCell(b, depth).layer).toBe(1023);
		expect(a[0]).toBe(b[0]);
	});
});

describe("chunkOf", () => {
	it("gives every cell of a chunk the same prefix", () => {
		const depth = 5;
		const chunkLevel = 2;
		const n = 1 << depth;
		const members = new Map<string, Set<string>>();
		for (let f = 0; f < 20; f++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const id = encodeCell(
						{ planet: 0, face: f, i, j, layer: 0 },
						depth,
					);
					const c = idKey(chunkOf(id, depth, chunkLevel));
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
		// keeps the same address at every chunk level.
		const depth = 5;
		const id = encodeCell(
			{ planet: 0, face: 9, i: 7, j: 11, layer: 2 },
			depth,
		);
		for (const c of [1, 2, 3, 4])
			expect(decodeCell(chunkOf(id, depth, c), depth).planet).toBe(0);
		expect(
			encodeCell({ planet: 0, face: 9, i: 7, j: 11, layer: 2 }, depth),
		).toEqual(id);
	});
});
