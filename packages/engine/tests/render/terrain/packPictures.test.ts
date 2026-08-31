import { describe, expect, it } from "vitest";
import { packPictures } from "chamfer/render";

describe("packPictures", () => {
	// The arrangement with nothing wrong with it: a layer each, the sampler's
	// own repeat, and every mip level a picture's own down to one texel.
	it("gives every picture a layer of its own when the device allows", () => {
		const packed = packPictures(110, 64, 7, 256);
		expect(packed.perSide).toBe(1);
		expect(packed.layers).toBe(110);
		expect(packed.side).toBe(64);
		expect(packed.levels).toBe(7);
	});

	it("is the identity transform when unpacked, so the frame cannot move", () => {
		const { places } = packPictures(110, 64, 7, 256);
		for (let at = 0; at < 110; at++) {
			expect(places[at * 4]).toBe(at); // layer is the picture
			expect(places[at * 4 + 1]).toBe(0); // no offset
			expect(places[at * 4 + 2]).toBe(0);
			expect(places[at * 4 + 3]).toBe(1); // no scale
		}
	});

	it("shares layers only as much as it has to", () => {
		// 110 pictures over 32 layers needs 4 apiece, which is two a side.
		const packed = packPictures(110, 64, 7, 32);
		expect(packed.perSide).toBe(2);
		expect(packed.layers).toBe(28);
		expect(packed.side).toBe(128);
	});

	it("puts every picture somewhere, once, inside its own layer", () => {
		const packed = packPictures(110, 64, 7, 32);
		const seen = new Set<string>();
		for (let at = 0; at < 110; at++) {
			const layer = packed.places[at * 4]!;
			const u = packed.places[at * 4 + 1]!;
			const v = packed.places[at * 4 + 2]!;
			expect(layer).toBeLessThan(packed.layers);
			expect(u).toBeGreaterThanOrEqual(0);
			expect(u).toBeLessThan(1);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
			seen.add(`${layer}:${u}:${v}`);
		}
		expect(seen.size).toBe(110);
	});

	// A tile that is one texel has no inside left: any filtering at all reads
	// the tile beside it, which unpacked does not exist.
	it("stops the mip chain before a shared tile is too small to filter in", () => {
		expect(packPictures(110, 64, 7, 32).levels).toBe(5); // 64 down to 4
		expect(packPictures(110, 64, 7, 256).levels).toBe(7); // all of it
	});

	it("scales so a picture's own coordinate covers exactly its tile", () => {
		const packed = packPictures(110, 64, 7, 32);
		expect(packed.places[3]).toBeCloseTo(0.5, 10);
	});
});
