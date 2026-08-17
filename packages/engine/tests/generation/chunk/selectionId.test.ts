import { describe, expect, it } from "vitest";
import { selectionId, selectionOf } from "chamfer/generation";

describe("selectionId", () => {
	it("round-trips level and key at every scale the word allows", () => {
		// A 16-cell chunk on a depth-13 world is chunk level 9, whose keys
		// pass five million -- far past the 2^20 field this id once used, and
		// two colliding chunks share one slot in every resident set: each
		// upload evicts the other, and the ground flickers with holes no mesh
		// ever had.
		for (const chunkLevel of [0, 4, 9, 13, 17])
			for (const key of [0, 1, 5_242_879, 20 * 4 ** 13 - 1]) {
				const id = selectionId(chunkLevel, key);
				expect(selectionOf(id)).toEqual({ chunkLevel, key });
			}
	});

	it("never collides across levels at a depth-13 world's counts", () => {
		const seen = new Set<number>();
		for (let chunkLevel = 0; chunkLevel <= 9; chunkLevel++)
			for (let key = 0; key < 50; key++)
				seen.add(selectionId(chunkLevel, 20 * 4 ** 9 - 1 - key));
		expect(seen.size).toBe(10 * 50);
	});
});
