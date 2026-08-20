import { describe, expect, it } from "vitest";
import {
	ChunkAddress,
	addressesOverlap,
	chunkOverlaps,
} from "chamfer/generation";

describe("addressesOverlap", () => {
	const parent = new ChunkAddress(4, [1, 2]);
	const child = new ChunkAddress(4, [1, 2, 3]);
	const sibling = new ChunkAddress(4, [1, 3]);
	const elsewhere = new ChunkAddress(9, [1, 2]);

	it("overlaps itself, its ancestors and its descendants", () => {
		expect(addressesOverlap(parent, parent)).toBe(true);
		expect(addressesOverlap(parent, child)).toBe(true);
		expect(addressesOverlap(child, parent)).toBe(true);
	});

	it("never overlaps a sibling or another face", () => {
		expect(addressesOverlap(parent, sibling)).toBe(false);
		expect(addressesOverlap(child, sibling)).toBe(false);
		expect(addressesOverlap(parent, elsewhere)).toBe(false);
	});

	it("agrees with chunkOverlaps on decoded addresses, the invariant dropReplaced leans on", () => {
		// dropReplaced decodes each side once and calls this directly instead
		// of chunkOverlaps, precisely so the decode is not repeated once per
		// pairing. The two must answer identically for every pair or that
		// change is a behaviour change, not just a faster path to the same one.
		const addresses = [parent, child, sibling, elsewhere];
		for (const a of addresses)
			for (const b of addresses)
				expect(addressesOverlap(a, b)).toBe(
					chunkOverlaps(a.path.length, a.key, b.path.length, b.key),
				);
	});
});
