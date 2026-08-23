import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	BlockType,
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	applyDeltas,
	buildCoarseMap,
	coarseChunkKey,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import {
	DeltaStore,
	STORE_VERSION,
	chunksHolding,
	cellSlot,
	chunksReading,
	packBlockState,
} from "chamfer/edit";
import { buildChunkMesh } from "chamfer/mesh";
import { joinPath, neighbour } from "chamfer/addressing";
import { WorldShape, maxCrustDepth } from "chamfer/world";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const LAYERS = 60;
const N = 1 << DEPTH;
const M = 1 << (DEPTH - CHUNK_LEVEL);

const header = () => ({
	version: STORE_VERSION,
	subdivisionDepth: DEPTH,
	chunkLevel: CHUNK_LEVEL,
	registry: ["chamfer:air", "chamfer:stone"],
});

let map: CoarseMap;
let shape: WorldShape;
let terrain: TerrainGenerator;

beforeAll(() => {
	map = buildCoarseMap(seedFromString("chamfer"), {
		level: 6,
		cellMetres: 100,
		relief: 100,
	});
	shape = new WorldShape(1700, DEPTH, 150, maxCrustDepth(DEPTH));
	terrain = new TerrainGenerator(map.seed, shape, map);
});

/** The chunk's own cells, and the ring one step past its rim. */
function around(address: ChunkAddress): {
	mine: Set<string>;
	outside: { face: number; i: number; j: number }[];
} {
	const mine = new Set<string>();
	for (let q = 0; q <= M; q++)
		for (let r = 0; q + r <= M; r++) {
			const [i, j] = joinPath(address.path, q, r, DEPTH);
			mine.add(`${address.face}:${i}:${j}`);
		}
	const outside: { face: number; i: number; j: number }[] = [];
	const seen = new Set<string>();
	for (let q = 0; q <= M; q++)
		for (let r = 0; q + r <= M; r++) {
			if (q > 0 && r > 0 && q + r < M) continue;
			const [i, j] = joinPath(address.path, q, r, DEPTH);
			for (let k = 0; k < 6; k++) {
				const nb = neighbour(address.face, N, i, j, k);
				if (!nb) continue;
				const name = `${nb.face}:${nb.i}:${nb.j}`;
				if (mine.has(name) || seen.has(name)) continue;
				seen.add(name);
				outside.push(nb);
			}
		}
	return { mine, outside };
}

describe("an edit at a chunk border", () => {
	const address = new ChunkAddress(3, [1, 2, 0, 3]);
	const key = address.key;

	// The routing half. A chunk meshes the ring past its own rim, so being
	// told only about the cells its triangle contains leaves it drawing the
	// seed's ground where somebody has already dug.
	it("reaches the chunk next door, which holds none of it", () => {
		const { outside } = around(address);
		expect(outside.length).toBeGreaterThan(20);

		let held = 0;
		let read = 0;
		for (const cell of outside) {
			const at = { ...cell, layer: 20 };
			if (
				chunksHolding(at, DEPTH, CHUNK_LEVEL).some(
					(h) => h.chunkKey === key,
				)
			)
				held++;
			if (chunksReading(at, DEPTH, CHUNK_LEVEL).includes(key)) read++;
		}
		// Not one of them is inside this chunk's triangle, and every one of
		// them is read by it.
		expect(held).toBe(0);
		expect(read).toBe(outside.length);
	});

	it("is handed to that chunk by the store", () => {
		const { outside } = around(address);
		const store = new DeltaStore(header());
		const cell = { ...outside[0]!, layer: 20 };
		expect(store.write(cell, packBlockState(0))).toContain(key);
		expect(store.rowsFor(key).length).toBeGreaterThan(0);
	});

	// The meshing half. The cell has no slot here, so it must come back out of
	// applyDeltas and reach the sampler, which is the only thing that reads it.
	it("changes the column the mesher generates for it", () => {
		const { outside } = around(address);
		const store = new DeltaStore(header());

		// A cell past the rim whose column has ground to take away.
		const chunk = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
		const plain = new ChunkColumnSampler(chunk, terrain);
		const cell = outside.find((at) => {
			const column = plain.columnAt(at.face, at.i, at.j);
			return column.first >= 0 && column.first < LAYERS - 2;
		})!;
		expect(cell).toBeDefined();
		const before = plain.columnAt(cell.face, cell.i, cell.j);
		const layer = before.first;
		expect(before.blocks[layer]).not.toBe(BlockType.AIR);

		store.write({ ...cell, layer }, packBlockState(BlockType.AIR));
		const patched = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
		const outsideBlocks = applyDeltas(
			patched,
			store.rowsFor(key),
			DEPTH,
			0,
		);
		expect(outsideBlocks.size).toBeGreaterThan(0);

		const after = new ChunkColumnSampler(
			patched,
			terrain,
			outsideBlocks,
		).columnAt(cell.face, cell.i, cell.j);
		expect(after.blocks[layer]).toBe(BlockType.AIR);
		// The band is what the mesher walks, so it has to move with the block.
		expect(after.first).toBeGreaterThan(before.first);
	});

	// The whole point, end to end. Before this, meshing the chunk next door
	// gave byte-identical geometry whether the cell had been dug or not: its
	// apron went on drawing the seed's cap and its rim cells went on being
	// told there was rock where the tunnel was.
	it("changes what the chunk next door draws", () => {
		const { outside } = around(address);
		const plain = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
		const sampler = new ChunkColumnSampler(plain, terrain);
		const cell = outside.find((at) => {
			const column = sampler.columnAt(at.face, at.i, at.j);
			return column.first >= 0 && column.first < LAYERS - 2;
		})!;
		const before = buildChunkMesh(plain, sampler, shape, map.seed, {
			apron: true,
		});

		const store = new DeltaStore(header());
		const layer = sampler.columnAt(cell.face, cell.i, cell.j).first;
		store.write({ ...cell, layer }, packBlockState(BlockType.AIR));

		const dug = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
		const outsideBlocks = applyDeltas(dug, store.rowsFor(key), DEPTH, 0);
		const after = buildChunkMesh(
			dug,
			new ChunkColumnSampler(dug, terrain, outsideBlocks),
			shape,
			map.seed,
			{ apron: true },
		);

		expect(after.opaque.vertices).not.toEqual(before.opaque.vertices);
	});

	// **The invariant the whole scheme rests on.** A chunk generates the cells
	// past its rim rather than fetching the neighbour, which is only sound
	// while the two agree -- terrain is a pure function of the address, and a
	// player's changes are not. So for every cell one step out, what this
	// chunk generates has to be what the chunk that owns it holds.
	it("generates the same column the chunk that owns the cell holds", () => {
		const { outside } = around(address);
		const store = new DeltaStore(header());
		const chunk = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
		const plain = new ChunkColumnSampler(chunk, terrain);

		// Change something in a third of them, breaking and placing both.
		let written = 0;
		for (let at = 0; at < outside.length; at += 3) {
			const cell = outside[at]!;
			const column = plain.columnAt(cell.face, cell.i, cell.j);
			if (column.first < 1 || column.first >= LAYERS - 2) continue;
			store.write(
				{ ...cell, layer: column.first },
				packBlockState(BlockType.AIR),
			);
			store.write(
				{ ...cell, layer: column.first - 1 },
				packBlockState(BlockType.STONE),
			);
			written++;
		}
		expect(written).toBeGreaterThan(5);

		const mine = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
		const sampler = new ChunkColumnSampler(
			mine,
			terrain,
			applyDeltas(mine, store.rowsFor(key), DEPTH, 0),
		);

		for (const cell of outside) {
			const owner = cellSlot(
				{ ...cell, layer: 0 },
				DEPTH,
				CHUNK_LEVEL,
			).chunkKey;
			const theirs = generateChunk(
				terrain,
				ChunkAddress.fromKey(owner, CHUNK_LEVEL),
				CHUNK_LEVEL,
				LAYERS,
			);
			applyDeltas(theirs, store.rowsFor(owner), DEPTH, 0);
			const held = theirs.columnOf(
				cellSlot({ ...cell, layer: 0 }, DEPTH, CHUNK_LEVEL).slot,
			);
			const generated = sampler.columnAt(cell.face, cell.i, cell.j);
			expect(
				[...generated.blocks],
				`cell ${cell.face}:${cell.i}:${cell.j}`,
			).toEqual([...held.blocks]);
			expect(generated.first).toBe(held.first);
			expect(generated.last).toBe(held.last);
		}
	});

	it("still writes a cell of its own into the chunk's own array", () => {
		const store = new DeltaStore(header());
		const [i, j] = joinPath(address.path, 2, 2, DEPTH);
		const chunk = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
		const layer = chunk.columnOf(0).first + 1;
		store.write({ face: address.face, i, j, layer }, packBlockState(0));
		const outsideBlocks = applyDeltas(chunk, store.rowsFor(key), DEPTH, 0);
		expect(outsideBlocks.size).toBe(0);
	});
});

// **The path a real edit takes to a chunk drawn coarse**, which had no test at
// all and did not work: the store is filed at the finest chunk level, the same
// ground has a different key at every level, and a coarse chunk asking with its
// own key got nothing back. So every change vanished the moment its chunk
// dropped a level -- a distance rather than an event, which reads as edits
// evaporating as you walk away.
describe("an edit seen from a distance", () => {
	const address = new ChunkAddress(3, [1, 2, 0, 3]);

	/** A coarse chunk over the same ground, built the way the worker builds it. */
	function coarse(lod: number) {
		const shrunk = shape.atLod(lod);
		const level = CHUNK_LEVEL - lod;
		const at = new ChunkAddress(address.face, address.path.slice(0, level));
		const terrain = new TerrainGenerator(map.seed, shrunk, map);
		return {
			at,
			terrain,
			chunk: generateChunk(terrain, at, level, LAYERS),
			level,
		};
	}

	it("reaches a chunk drawn one, two and three levels coarser", () => {
		const store = new DeltaStore(header());
		const [i, j] = joinPath(address.path, 4, 4, DEPTH);
		const cell = { face: address.face, i, j, layer: 0 };
		const fine = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
		const ground = fine.columnOf(
			cellSlot(cell, DEPTH, CHUNK_LEVEL).slot,
		).first;
		expect(ground).toBeGreaterThan(2);
		store.write(
			{ ...cell, layer: ground - 1 },
			packBlockState(BlockType.SNOW),
		);

		for (const lod of [1, 2, 3]) {
			const { at, chunk, level } = coarse(lod);
			const rows = store.rowsUnder(at.key, level);
			expect(rows.length, `no rows at lod ${lod}`).toBeGreaterThan(0);

			const before = [...chunk.blocks];
			applyDeltas(chunk, rows, DEPTH, lod);
			const moved = [...chunk.blocks].filter(
				(block, n) => block !== before[n],
			).length;
			expect(moved, `nothing landed at lod ${lod}`).toBeGreaterThan(0);
			expect([...chunk.blocks]).toContain(BlockType.SNOW);
		}
	});

	// The gap chunkReaders closes: an edit deep inside the neighbour's own
	// territory, not merely one fine cell over the shared boundary. A
	// fine-to-fine chase never finds this one; a ring computed in the coarse
	// chunk's own lattice does.
	it("reaches an edit made well inside the neighbouring chunk, once coarse", () => {
		const store = new DeltaStore(header());
		// Verified against tools/probe-coarse-reach.ts: this cell coarsens
		// into chunk 216's outside ring at lod 1, and chunk 216 is the
		// coarse-3 ancestor of `address` (face 3, path [1,2,0,3]).
		const level = CHUNK_LEVEL - 1;
		const ancestorKey = coarseChunkKey(address.key, CHUNK_LEVEL, level);
		expect(ancestorKey).toBe(216);
		store.write(
			{ face: 3, i: 125, j: 67, layer: 20 },
			packBlockState(BlockType.SNOW),
		);

		const { at, chunk, terrain: shrunk } = coarse(1);
		expect(at.key).toBe(ancestorKey);
		const rows = store.rowsUnder(at.key, level);
		expect(rows.length).toBeGreaterThan(0);

		// The cell is in the ring, not the triangle: it lands in the
		// sampler's outside blocks rather than the chunk's own array, and it
		// is the sampler that draws it.
		const outside = applyDeltas(chunk, rows, DEPTH, 1);
		expect(outside.size).toBeGreaterThan(0);
		const sampler = new ChunkColumnSampler(chunk, shrunk, outside);
		const column = sampler.columnAt(3, 63, 33);
		expect([...column.blocks]).toContain(BlockType.SNOW);
	});

	it("names the same triangle at every level", () => {
		// The conversion the invalidation depends on: drop a change and the
		// chunk actually showing that ground has to be dropped too, whatever
		// level the selection picked for it.
		for (const lod of [1, 2, 3]) {
			const { at, level } = coarse(lod);
			expect(coarseChunkKey(address.key, CHUNK_LEVEL, level)).toBe(
				at.key,
			);
		}
		// And asking for a level no coarser than its own is the key itself.
		expect(coarseChunkKey(address.key, CHUNK_LEVEL, CHUNK_LEVEL)).toBe(
			address.key,
		);
	});
});
