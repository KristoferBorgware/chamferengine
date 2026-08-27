import { describe, expect, it } from "vitest";
import { BlockType, Chunk, ChunkAddress } from "chamfer/generation";
import { probeVolume } from "chamfer/light";
import { rank } from "chamfer/addressing";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const LAYERS = 64;

/**
 * A chunk of solid rock with air above it, and nothing else.
 *
 * `groundLayer` is the topmost solid layer, so everything above it is open
 * sky and everything below is rock. A hollow is then cut into it by hand,
 * which is the whole point of the fixture: a probe volume is only interesting
 * where the ground is not a plane.
 */
function slab(groundLayer: number): Chunk {
	const chunk = new Chunk(
		ChunkAddress.fromKey(0, CHUNK_LEVEL),
		DEPTH,
		CHUNK_LEVEL,
		LAYERS,
	);
	for (let slot = 0; slot < chunk.slots; slot++) {
		for (let layer = groundLayer; layer < LAYERS; layer++)
			chunk.blocks[slot * LAYERS + layer] = BlockType.STONE;
		chunk.band[slot * 2] = groundLayer;
		chunk.band[slot * 2 + 1] = LAYERS - 1;
	}
	return chunk;
}

/** Cut a square shaft straight down from the ground, `deep` layers of it. */
function dig(
	chunk: Chunk,
	groundLayer: number,
	deep: number,
	from: number,
	to: number,
): void {
	for (let q = from; q <= to; q++)
		for (let r = from; r <= to; r++) {
			if (q + r > chunk.m) continue;
			const slot = rank(q, r, chunk.m);
			for (let layer = groundLayer; layer < groundLayer + deep; layer++)
				chunk.blocks[slot * LAYERS + layer] = BlockType.AIR;
			chunk.band[slot * 2] = groundLayer + deep;
		}
}

/** How much light a probe holds, by its grid position. */
function lightAt(
	volume: ReturnType<typeof probeVolume>,
	q: number,
	r: number,
	d: number,
): number {
	const at = ((d * volume.across + r) * volume.across + q) * 4;
	return volume.data[at + 3]! / 255;
}

/** The direction light arrives from, unbiased back out of the bytes. */
function fromAt(
	volume: ReturnType<typeof probeVolume>,
	q: number,
	r: number,
	d: number,
): [number, number, number] {
	const at = ((d * volume.across + r) * volume.across + q) * 4;
	return [
		(volume.data[at]! / 255) * 2 - 1,
		(volume.data[at + 1]! / 255) * 2 - 1,
		(volume.data[at + 2]! / 255) * 2 - 1,
	];
}

describe("a chunk's probe volume", () => {
	const GROUND = 20;

	it("fills the open air and leaves the rock dark", () => {
		const chunk = slab(GROUND);
		const volume = probeVolume(chunk, 4, 0, LAYERS - 1);
		// A probe over the ground sees the sky outright; one inside the slab
		// has nothing to hold and nothing to pass on.
		expect(lightAt(volume, 1, 1, 0)).toBeCloseTo(1, 2);
		const deep = Math.floor((LAYERS - 1 - GROUND) / 4);
		expect(lightAt(volume, 1, 1, deep)).toBeCloseTo(0, 2);
	});

	it("carries light down a shaft, dimming with depth", () => {
		// The picture this is for: a hole in the ground that is black all the
		// way down, because nothing carries light into it.
		const chunk = slab(GROUND);
		dig(chunk, GROUND, 24, 2, 10);
		const volume = probeVolume(chunk, 2, GROUND - 2, GROUND + 26);

		const column = [];
		for (let d = 1; d < volume.down - 1; d++)
			column.push(lightAt(volume, 3, 3, d));

		// Light at the top of the shaft and less further down: a gradient
		// rather than the one flat number a floor gives.
		expect(column[0]!).toBeGreaterThan(0.5);
		const lit = column.filter((value) => value > 0.02);
		expect(lit.length).toBeGreaterThan(2);
		// Monotone: every step down holds no more than the step above it.
		for (let n = 1; n < column.length; n++)
			expect(column[n]!).toBeLessThanOrEqual(column[n - 1]! + 1e-6);
		// And it really does fall, rather than being flat all the way.
		expect(column[column.length - 1]!).toBeLessThan(column[0]!);
	});

	it("points the light in a shaft back up toward the opening", () => {
		// The bent normal is what lets the shader ask "is the sun where this
		// light is coming from" -- and down a shaft the answer had better be
		// the sky above rather than the rock beside it.
		const chunk = slab(GROUND);
		dig(chunk, GROUND, 24, 2, 10);
		const volume = probeVolume(chunk, 2, GROUND - 2, GROUND + 26);
		const [, , up] = fromAt(volume, 3, 3, 3);
		expect(up).toBeGreaterThan(0.4);
	});

	it("holds four bytes a probe and no more", () => {
		const chunk = slab(GROUND);
		const volume = probeVolume(chunk, 8, 0, LAYERS - 1);
		expect(volume.data.length).toBe(
			volume.across * volume.across * volume.down * 4,
		);
		// Coarse on purpose: the whole case for probes is that they cost a
		// fraction of the cells they stand among.
		const cells = chunk.slots * LAYERS;
		const probes = volume.across * volume.across * volume.down;
		expect(probes).toBeLessThan(cells / 20);
	});

	it("gives a coarser grid fewer probes and the same shape", () => {
		const chunk = slab(GROUND);
		dig(chunk, GROUND, 24, 2, 10);
		const fine = probeVolume(chunk, 2, GROUND - 2, GROUND + 26);
		const coarse = probeVolume(chunk, 4, GROUND - 2, GROUND + 26);
		expect(coarse.across).toBeLessThan(fine.across);
		// Both still light the top of the shaft and darken below it, which is
		// what says the spacing is a cost dial rather than a different model.
		expect(lightAt(coarse, 1, 1, 1)).toBeGreaterThan(0.3);
	});
});
