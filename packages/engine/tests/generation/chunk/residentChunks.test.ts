import { describe, expect, it } from "vitest";
import {
	Chunk,
	ChunkAddress,
	ChunkAtlas,
	ChunkStore,
	chunkCenter,
	horizonAngle,
	residentChunks,
} from "chamfer/generation";

const DEPTH = 8;
const CHUNK_LEVEL = 3;
const RADIUS = 1700;

describe("chunkCenter", () => {
	it("puts every chunk on the unit sphere", () => {
		for (let key = 0; key < ChunkAddress.countAt(CHUNK_LEVEL); key += 7) {
			const extent = chunkCenter(
				ChunkAddress.fromKey(key, CHUNK_LEVEL),
				DEPTH,
				CHUNK_LEVEL,
			);
			const length = Math.sqrt(
				extent.x * extent.x + extent.y * extent.y + extent.z * extent.z,
			);
			expect(length).toBeCloseTo(1, 12);
			expect(extent.cosRadius).toBeGreaterThan(0);
			expect(extent.cosRadius).toBeLessThan(1);
		}
	});

	it("shrinks a chunk as the cut goes finer", () => {
		const wide = chunkCenter(ChunkAddress.fromKey(0, 1), DEPTH, 1);
		const narrow = chunkCenter(ChunkAddress.fromKey(0, 5), DEPTH, 5);
		expect(narrow.cosRadius).toBeGreaterThan(wide.cosRadius);
	});
});

describe("horizonAngle", () => {
	it("reaches 76 m at eye height on the worked planet", () => {
		const angle = horizonAngle(RADIUS + 1.7, RADIUS);
		expect(angle * RADIUS).toBeCloseTo(76, 0);
	});

	it("is nothing at the surface and most of a hemisphere from far off", () => {
		expect(horizonAngle(RADIUS, RADIUS)).toBe(0);
		expect(horizonAngle(RADIUS - 5, RADIUS)).toBe(0);
		expect(horizonAngle(RADIUS * 100, RADIUS)).toBeGreaterThan(1.55);
		expect(horizonAngle(RADIUS * 100, RADIUS)).toBeLessThan(Math.PI / 2);
	});
});

describe("residentChunks", () => {
	const atlas = new ChunkAtlas(DEPTH, CHUNK_LEVEL);

	it("has one entry per chunk on the planet", () => {
		expect(atlas.extents.length).toBe(20 * 4 ** CHUNK_LEVEL);
	});

	it("selects the chunk the viewer is standing on", () => {
		const under = atlas.extents[137]!;
		const chosen = residentChunks(atlas, under, RADIUS + 1.7, RADIUS);
		expect(chosen[0]).toBe(137);
	});

	it("selects more from higher up", () => {
		const viewer = atlas.extents[0]!;
		const ground = residentChunks(atlas, viewer, RADIUS + 2, RADIUS).length;
		const air = residentChunks(atlas, viewer, RADIUS + 300, RADIUS).length;
		const orbit = residentChunks(atlas, viewer, RADIUS * 4, RADIUS).length;
		expect(air).toBeGreaterThan(ground);
		expect(orbit).toBeGreaterThan(air);
		// From far enough out the far side is still hidden, so it never reaches
		// the whole planet.
		expect(orbit).toBeLessThan(atlas.extents.length);
	});

	it("orders nearest first, so an early stop keeps the ground underfoot", () => {
		const viewer = atlas.extents[500]!;
		const chosen = residentChunks(atlas, viewer, RADIUS + 200, RADIUS);
		let previous = 2;
		for (const key of chosen) {
			const extent = atlas.extents[key]!;
			const cos =
				viewer.x * extent.x + viewer.y * extent.y + viewer.z * extent.z;
			expect(cos).toBeLessThanOrEqual(previous + 1e-12);
			previous = cos;
		}
		expect(chosen[0]).toBe(500);
	});

	it("honours a limit", () => {
		const viewer = atlas.extents[12]!;
		expect(
			residentChunks(atlas, viewer, RADIUS * 4, RADIUS, 25).length,
		).toBe(25);
	});

	it("takes an unnormalised viewer direction", () => {
		const viewer = atlas.extents[42]!;
		const scaled = {
			x: viewer.x * RADIUS,
			y: viewer.y * RADIUS,
			z: viewer.z * RADIUS,
		};
		// The same chunks. Scaling and normalising again moves the cosines by a
		// few last bits, which can swap two chunks that are the same distance
		// away, so the sets are compared rather than the orders. Nothing
		// downstream compares two clients' resident lists.
		expect(
			residentChunks(atlas, scaled, RADIUS + 50, RADIUS).sort(
				(a, b) => a - b,
			),
		).toEqual(
			residentChunks(atlas, viewer, RADIUS + 50, RADIUS).sort(
				(a, b) => a - b,
			),
		);
	});
});

describe("ChunkStore", () => {
	const chunk = (key: number) =>
		new Chunk(ChunkAddress.fromKey(key, 2), 6, 2, 8);

	it("holds what fits and drops the least recently used", () => {
		const one = chunk(0).byteLength;
		const store = new ChunkStore(one * 3);
		for (const key of [0, 1, 2]) store.set(key, chunk(key));
		expect(store.size).toBe(3);

		store.set(3, chunk(3));
		expect(store.size).toBe(3);
		expect(store.has(0)).toBe(false);
		expect(store.has(3)).toBe(true);
	});

	it("keeps a chunk alive by reading it", () => {
		const one = chunk(0).byteLength;
		const store = new ChunkStore(one * 3);
		for (const key of [0, 1, 2]) store.set(key, chunk(key));
		store.get(0);
		store.set(3, chunk(3));
		expect(store.has(0)).toBe(true);
		expect(store.has(1)).toBe(false);
	});

	it("does not mark a chunk that is only peeked at", () => {
		const one = chunk(0).byteLength;
		const store = new ChunkStore(one * 2);
		store.set(0, chunk(0));
		store.set(1, chunk(1));
		store.peek(0);
		store.set(2, chunk(2));
		expect(store.has(0)).toBe(false);
	});

	it("tracks bytes across replacement and deletion", () => {
		const one = chunk(0).byteLength;
		const store = new ChunkStore(one * 10);
		store.set(0, chunk(0));
		store.set(0, chunk(0));
		expect(store.byteLength).toBe(one);
		expect(store.size).toBe(1);
		store.delete(0);
		expect(store.byteLength).toBe(0);
	});

	it("keeps one chunk even under a budget smaller than one", () => {
		const store = new ChunkStore(1);
		store.set(0, chunk(0));
		store.set(1, chunk(1));
		expect(store.size).toBe(1);
		expect(store.has(1)).toBe(true);
	});
});
