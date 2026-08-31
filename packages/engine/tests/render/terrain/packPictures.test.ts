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

	// A world holds a fraction of the pictures that exist, so the rest need
	// not be on the GPU at all -- which is the only thing that scales without
	// end, since layers and memory both run out eventually.
	it("stores only the pictures asked for", () => {
		const want = new Set([0, 5, 9]);
		const packed = packPictures(110, 64, 7, 256, want);
		expect(packed.order).toEqual([0, 5, 9]);
		expect(packed.layers).toBe(3);
		for (const picture of want)
			expect(packed.places[picture * 4]).toBeGreaterThanOrEqual(0);
	});

	it("packs a small resident set into few layers rather than many", () => {
		const want = new Set([...Array(9).keys()]);
		const packed = packPictures(110, 64, 7, 4, want);
		expect(packed.perSide).toBe(2);
		expect(packed.layers).toBe(3);
		expect(packed.order.length).toBe(9);
	});

	// Something on the screen beats the right thing later: a block whose
	// picture is not stored draws flat in roughly its own colour, never white
	// and never whatever happens to occupy that slot.
	it("gives a picture it did not store its own colour and no layer", () => {
		const packed = packPictures(4, 64, 7, 256, new Set([1]), (picture) => [
			picture / 10,
			0.5,
			0.25,
		]);
		expect(packed.places[0]).toBe(-1); // picture 0: not stored
		expect(packed.places[1]).toBeCloseTo(0, 10);
		expect(packed.places[2]).toBeCloseTo(0.5, 10);
		expect(packed.places[3]).toBeCloseTo(0.25, 10);
		expect(packed.places[4]).toBe(0); // picture 1: stored, on layer 0
	});

	it("keeps the identity when everything is resident", () => {
		const all = new Set([...Array(110).keys()]);
		const packed = packPictures(110, 64, 7, 256, all);
		for (let at = 0; at < 110; at++) {
			expect(packed.places[at * 4]).toBe(at);
			expect(packed.places[at * 4 + 3]).toBe(1);
		}
	});

	it("scales so a picture's own coordinate covers exactly its tile", () => {
		const packed = packPictures(110, 64, 7, 32);
		expect(packed.places[3]).toBeCloseTo(0.5, 10);
	});
});
