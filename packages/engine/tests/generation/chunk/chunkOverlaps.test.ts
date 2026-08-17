import { describe, expect, it } from "vitest";
import { ChunkAddress, chunkOverlaps } from "chamfer/generation";

describe("chunkOverlaps", () => {
	const parent = new ChunkAddress(4, [1, 2]);
	const child = new ChunkAddress(4, [1, 2, 3]);
	const sibling = new ChunkAddress(4, [1, 3]);
	const elsewhere = new ChunkAddress(9, [1, 2]);

	it("overlaps itself, its ancestors and its descendants", () => {
		expect(chunkOverlaps(2, parent.key, 2, parent.key)).toBe(true);
		expect(chunkOverlaps(2, parent.key, 3, child.key)).toBe(true);
		expect(chunkOverlaps(3, child.key, 2, parent.key)).toBe(true);
	});

	it("never overlaps a sibling or another face", () => {
		expect(chunkOverlaps(2, parent.key, 2, sibling.key)).toBe(false);
		expect(chunkOverlaps(3, child.key, 2, sibling.key)).toBe(false);
		expect(chunkOverlaps(2, parent.key, 2, elsewhere.key)).toBe(false);
	});
});
