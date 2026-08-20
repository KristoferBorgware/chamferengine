import { describe, expect, it } from "vitest";
import { gridCellColor } from "chamfer/mesh";
import type { GridPaint } from "chamfer/mesh";

const BASE: GridPaint = {
	levels: true,
	cells: true,
	chunks: true,
	faces: true,
	lod: 0,
	finest: 8,
};

function colorOf(grid: GridPaint, i = 10, j = 20): [number, number, number] {
	const out = new Float32Array(3);
	gridCellColor(grid, 4, i, j, 42, out, 0);
	return [out[0]!, out[1]!, out[2]!];
}

describe("gridCellColor", () => {
	it("is a color, at every level the ramp can be asked for", () => {
		for (let lod = 0; lod <= 10; lod++) {
			const c = colorOf({ ...BASE, lod, finest: 10, cells: false });
			for (const channel of c) {
				expect(channel).toBeGreaterThanOrEqual(0);
				expect(channel).toBeLessThanOrEqual(1);
			}
		}
	});

	it("separates full detail from the coarsest by hue", () => {
		// Teal at full detail, violet at the coarsest -- the demo's ramp. Read
		// as channels: green dominates blue at lod 0, blue dominates at max.
		const fine = colorOf({ ...BASE, lod: 0, cells: false });
		const coarse = colorOf({ ...BASE, lod: 8, cells: false });
		expect(fine[1]).toBeGreaterThan(fine[2]);
		expect(coarse[2]).toBeGreaterThan(coarse[1]);
	});

	it("varies by cell exactly when cells are on", () => {
		const a = colorOf(BASE, 10, 20);
		const b = colorOf(BASE, 11, 20);
		expect(a).not.toEqual(b);

		const flatA = colorOf({ ...BASE, cells: false }, 10, 20);
		const flatB = colorOf({ ...BASE, cells: false }, 11, 20);
		expect(flatA).toEqual(flatB);
	});

	it("holds one grey when levels are off", () => {
		const a = colorOf({ ...BASE, levels: false, cells: false, lod: 0 });
		const b = colorOf({ ...BASE, levels: false, cells: false, lod: 8 });
		expect(a).toEqual(b);
	});

	it("survives a world of one chunk, where finest is zero", () => {
		const c = colorOf({ ...BASE, lod: 0, finest: 0, cells: false });
		for (const channel of c) expect(Number.isFinite(channel)).toBe(true);
	});
});
