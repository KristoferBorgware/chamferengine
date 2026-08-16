import { describe, expect, it } from "vitest";
import { chunkSide, chunkSlots, rank } from "chamfer/addressing";

describe("rank", () => {
	it("is a bijection onto the chunk's slots", () => {
		for (const m of [1, 2, 4, 8, 32]) {
			const seen = new Set<number>();
			for (let r = 0; r <= m; r++)
				for (let q = 0; q + r <= m; q++) {
					const k = rank(q, r, m);
					expect(Number.isInteger(k)).toBe(true);
					expect(k).toBeGreaterThanOrEqual(0);
					expect(k).toBeLessThan(chunkSlots(m));
					seen.add(k);
				}
			expect(seen.size).toBe(chunkSlots(m));
		}
	});

	it("gives 561 slots at depth 11, chunk level 6", () => {
		const m = chunkSide(11, 6);
		expect(m).toBe(32);
		expect(chunkSlots(m)).toBe(561);
	});

	it("leaves (3m + 2) / 2 slots empty on the average chunk", () => {
		// Every cell is owned exactly once, so the mean owned per chunk is
		// N(depth) / chunks, which reduces to m^2 / 2 whatever the cut.
		for (const m of [8, 16, 32, 128]) {
			const meanOwned = (m * m) / 2;
			expect(chunkSlots(m) - meanOwned).toBe((3 * m + 2) / 2);
		}
	});

	it("wastes 49 of 561 slots on the worked planet", () => {
		const m = chunkSide(11, 6);
		expect(chunkSlots(m) - (m * m) / 2).toBe(49);
	});
});
