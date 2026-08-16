import { describe, expect, it } from "vitest";
import { joinPath, splitPath } from "chamfer/addressing";

describe("splitPath and joinPath", () => {
	it("round-trips every lattice point at depth 8, chunk level 4", () => {
		const depth = 8;
		const levels = 4;
		const n = 1 << depth;
		let checked = 0;
		for (let i = 0; i <= n; i++)
			for (let j = 0; i + j <= n; j++) {
				const s = splitPath(i, j, depth, levels);
				expect(joinPath(s.path, s.q, s.r, depth)).toEqual([i, j]);
				checked++;
			}
		expect(checked).toBe(((n + 1) * (n + 2)) / 2);
	});

	it("leaves an offset inside the chunk triangle", () => {
		const depth = 8;
		const levels = 4;
		const side = 1 << (depth - levels);
		const n = 1 << depth;
		let worst = 0;
		for (let i = 0; i <= n; i++)
			for (let j = 0; i + j <= n; j++) {
				const s = splitPath(i, j, depth, levels);
				expect(s.q).toBeGreaterThanOrEqual(0);
				expect(s.r).toBeGreaterThanOrEqual(0);
				expect(s.q + s.r).toBeLessThanOrEqual(side);
				worst = Math.max(worst, s.q, s.r);
			}
		expect(worst).toBe(side);
	});

	it("leaves one of three corners when it walks the whole way down", () => {
		const depth = 6;
		const n = 1 << depth;
		const seen = new Set<string>();
		for (let i = 0; i <= n; i++)
			for (let j = 0; i + j <= n; j++) {
				const s = splitPath(i, j, depth, depth);
				seen.add(`${s.q},${s.r}`);
			}
		expect([...seen].sort()).toEqual(["0,0", "0,1", "1,0"]);
	});

	it("marks a middle-child descent as a flip", () => {
		const depth = 8;
		const n = 1 << depth;
		let flipped = 0;
		let total = 0;
		for (let i = 0; i <= n; i++)
			for (let j = 0; i + j <= n; j++) {
				if (splitPath(i, j, depth, 4).flip) flipped++;
				total++;
			}
		// Roughly 46% of chunks descend through an odd number of middle children.
		expect(flipped / total).toBeGreaterThan(0.4);
		expect(flipped / total).toBeLessThan(0.5);
	});
});
