import { describe, expect, it } from "vitest";
import { unpackGrid } from "chamfer/render";

/**
 * The bake lays every layer into a grid and the upload wants them in layer
 * order, so one walk stands between the file and the GPU. It has to be held to
 * that on its own: the failure it replaces was a canvas returning wrong data
 * with nothing raised, and a picture nobody can check by looking is exactly how
 * that went unnoticed.
 */
describe("unpackGrid", () => {
	/** A grid whose every texel names the layer it belongs to. */
	const grid = (wide: number, columns: number, layers: number) => {
		const rows = Math.ceil(layers / columns);
		const out = new Uint8Array(columns * wide * rows * wide * 4);
		for (let at = 0; at < layers; at++) {
			const x = (at % columns) * wide;
			const y = Math.floor(at / columns) * wide;
			for (let row = 0; row < wide; row++)
				for (let col = 0; col < wide; col++) {
					const to = ((y + row) * columns * wide + x + col) * 4;
					out[to] = at;
					out[to + 1] = row;
					out[to + 2] = col;
					out[to + 3] = 255;
				}
		}
		return out;
	};

	it("reads each layer out whole, in order", () => {
		const wide = 4;
		const columns = 3;
		const layers = 7; // deliberately not filling the last row
		const flat = unpackGrid(
			grid(wide, columns, layers),
			wide,
			columns,
			layers,
		);
		expect(flat.length).toBe(layers * wide * wide * 4);
		for (let at = 0; at < layers; at++)
			for (let row = 0; row < wide; row++)
				for (let col = 0; col < wide; col++) {
					const from = ((at * wide + row) * wide + col) * 4;
					expect([
						flat[from],
						flat[from + 1],
						flat[from + 2],
					]).toEqual([at, row, col]);
				}
	});

	// A bake from before the grid wrote one tile across, and that is a tall
	// column whose bytes are already in layer order -- so the same walk has to
	// come out as a straight copy rather than needing a case of its own.
	it("passes a single-column bake through unchanged", () => {
		const wide = 4;
		const layers = 5;
		const column = grid(wide, 1, layers);
		expect(unpackGrid(column, wide, 1, layers)).toEqual(
			new Uint8Array(column),
		);
	});
});
