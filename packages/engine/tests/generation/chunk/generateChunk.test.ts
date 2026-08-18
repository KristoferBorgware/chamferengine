import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	BlockType,
	Chunk,
	ChunkAddress,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { chunkSlots, joinPath, rank, splitPath } from "chamfer/addressing";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const LAYERS = 40;

let map: CoarseMap;
let shape: WorldShape;
let terrain: TerrainGenerator;

beforeAll(() => {
	map = buildCoarseMap(seedFromString("chamfer"), { level: 6 });
	shape = new WorldShape(1700, DEPTH, 150, maxCrustDepth(DEPTH));
	terrain = new TerrainGenerator(map.seed, shape, map);
});

describe("ChunkAddress", () => {
	it("round-trips every chunk through its key", () => {
		for (const chunkLevel of [0, 1, 3, 6]) {
			const count = ChunkAddress.countAt(chunkLevel);
			expect(count).toBe(20 * 4 ** chunkLevel);
			for (let key = 0; key < Math.min(count, 5000); key++) {
				const address = ChunkAddress.fromKey(key, chunkLevel);
				expect(address.key).toBe(key);
				expect(address.path.length).toBe(chunkLevel);
			}
		}
	});

	it("agrees with the path a cell splits into", () => {
		// A chunk is the triangle a cell's path walks down to, so an address
		// built from a cell's own split has to carry that cell.
		const n = 1 << DEPTH;
		for (const [face, i, j] of [
			[0, 17, 40],
			[9, 100, 60],
			[19, 3, 1],
		] as const) {
			const split = splitPath(i, j, DEPTH, CHUNK_LEVEL);
			const address = new ChunkAddress(face, split.path);
			const [backI, backJ] = joinPath(
				address.path,
				split.q,
				split.r,
				DEPTH,
			);
			expect([backI, backJ]).toEqual([i, j]);
			expect(n).toBeGreaterThan(i + j);
		}
	});
});

describe("Chunk", () => {
	it("reserves the same slots for every chunk", () => {
		const chunk = new Chunk(
			ChunkAddress.fromKey(0, CHUNK_LEVEL),
			DEPTH,
			CHUNK_LEVEL,
			LAYERS,
		);
		expect(chunk.m).toBe(1 << (DEPTH - CHUNK_LEVEL));
		expect(chunk.slots).toBe(chunkSlots(chunk.m));
		expect(chunk.blocks.length).toBe(chunk.slots * LAYERS);
	});

	it("gives 561 slots at the worked planet's cut", () => {
		const chunk = new Chunk(ChunkAddress.fromKey(0, 6), 11, 6, 435);
		expect(chunk.slots).toBe(561);
		expect(chunk.blocks.length).toBe(244035);
		// Two bytes a cell, two band entries of two bytes per slot, and two
		// surface radii of eight bytes per slot.
		expect(chunk.byteLength).toBe(244035 * 2 + 561 * 4 + 561 * 16);
	});

	it("keeps a stored surface radius bit-identical to the generator's", () => {
		// A radius is a world position, and 6,800 m is well past what float32
		// resolves at a millimetre. The cells around a chunk are generated on
		// demand rather than read from it, so a chunk that stored its own
		// radii any narrower would disagree with its neighbours about where
		// the ground is -- and the rounding to a layer is a ceil, which turns
		// that disagreement into a whole block of cliff.
		const wide = new WorldShape(6800.648485818399, 10, 4, 24);
		const generator = new TerrainGenerator(map.seed, wide, map);
		const chunk = generateChunk(
			generator,
			ChunkAddress.fromKey(3, 6),
			6,
			24,
		);
		let checked = 0;
		for (let q = 0; q <= chunk.m; q++)
			for (let r = 0; q + r <= chunk.m; r++) {
				const [i, j] = joinPath(chunk.address.path, q, r, 10);
				const stored = chunk.columnOf(rank(q, r, chunk.m));
				const fresh = generator.columnAt(chunk.address.face, i, j);
				expect(stored.groundRadius).toBe(fresh.groundRadius);
				expect(stored.waterRadius).toBe(fresh.waterRadius);
				checked++;
			}
		expect(checked).toBe(chunk.slots);
	});

	it("indexes a cell as its rank times the layer count", () => {
		const chunk = new Chunk(
			ChunkAddress.fromKey(7, CHUNK_LEVEL),
			DEPTH,
			CHUNK_LEVEL,
			LAYERS,
		);
		const seen = new Set<number>();
		for (let q = 0; q <= chunk.m; q++)
			for (let r = 0; q + r <= chunk.m; r++)
				for (let layer = 0; layer < LAYERS; layer++) {
					const at = chunk.indexOf(q, r, layer);
					expect(at).toBe(rank(q, r, chunk.m) * LAYERS + layer);
					expect(at).toBeLessThan(chunk.blocks.length);
					expect(seen.has(at)).toBe(false);
					seen.add(at);
				}
	});
});

describe("generateChunk", () => {
	it("fills every slot of the triangle, borders included", () => {
		const chunk = generateChunk(
			terrain,
			ChunkAddress.fromKey(40, CHUNK_LEVEL),
			CHUNK_LEVEL,
			LAYERS,
		);
		let written = 0;
		for (let q = 0; q <= chunk.m; q++)
			for (let r = 0; q + r <= chunk.m; r++) {
				const slot = rank(q, r, chunk.m);
				expect(chunk.columnOf(slot).first).toBeGreaterThanOrEqual(0);
				written++;
			}
		// The 8.7% of slots a neighbouring chunk owns are generated too, which
		// is what lets the mesher read a chunk's own border.
		expect(written).toBe(
			((chunk.m - 1) * (chunk.m - 2)) / 2 + 3 * (chunk.m - 1) + 3,
		);
		expect(written).toBe(chunk.slots);
	});

	it("agrees with the terrain generator cell for cell", () => {
		const address = ChunkAddress.fromKey(123, CHUNK_LEVEL);
		const chunk = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
		for (let q = 0; q <= chunk.m; q += 3)
			for (let r = 0; q + r <= chunk.m; r += 3) {
				const [i, j] = joinPath(address.path, q, r, DEPTH);
				const column = terrain.columnAt(address.face, i, j);
				for (let layer = 0; layer < LAYERS; layer += 7)
					expect(chunk.blockAt(q, r, layer)).toBe(
						terrain.blockAt(column, layer),
					);
			}
	});

	it("gives the same chunk twice for the same seed", () => {
		const a = generateChunk(
			terrain,
			ChunkAddress.fromKey(200, CHUNK_LEVEL),
			CHUNK_LEVEL,
			LAYERS,
		);
		const b = generateChunk(
			terrain,
			ChunkAddress.fromKey(200, CHUNK_LEVEL),
			CHUNK_LEVEL,
			LAYERS,
		);
		expect(a.blocks).toEqual(b.blocks);
		expect(a.band).toEqual(b.band);
	});

	it("matches its neighbour on a shared border", () => {
		// Two chunks meeting at a face edge name some of the same cells. Both
		// generate them, and both have to write the same block: terrain is
		// sampled from a direction, and the two chunks reach the same direction.
		const n = 1 << DEPTH;
		let shared = 0;
		for (const [face, i, j] of [
			[0, 16, 0],
			[0, 32, 16],
			[5, 48, 16],
		] as const) {
			const split = splitPath(i, j, DEPTH, CHUNK_LEVEL);
			const chunk = generateChunk(
				terrain,
				new ChunkAddress(face, split.path),
				CHUNK_LEVEL,
				LAYERS,
			);
			const column = terrain.columnAt(face, i, j);
			expect(i + j).toBeLessThanOrEqual(n);
			for (let layer = 0; layer < LAYERS; layer += 5)
				expect(chunk.blockAt(split.q, split.r, layer)).toBe(
					terrain.blockAt(column, layer),
				);
			shared++;
		}
		expect(shared).toBe(3);
	});

	it("writes air above the ground and never air below it", () => {
		const chunk = generateChunk(
			terrain,
			ChunkAddress.fromKey(88, CHUNK_LEVEL),
			CHUNK_LEVEL,
			LAYERS,
		);
		for (let q = 0; q <= chunk.m; q += 2)
			for (let r = 0; q + r <= chunk.m; r += 2) {
				const ground = chunk.columnOf(rank(q, r, chunk.m)).first;
				if (ground >= LAYERS) continue;
				expect(chunk.blockAt(q, r, ground)).not.toBe(BlockType.AIR);
				for (let layer = ground; layer < LAYERS; layer++)
					expect(chunk.blockAt(q, r, layer)).not.toBe(BlockType.AIR);
			}
	});
});
