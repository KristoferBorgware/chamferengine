import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	BlockType,
	ChunkAddress,
	TerrainGenerator,
	applyDeltas,
	buildCoarseMap,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import { ChunkDeltas, cellSlot, packBlockState, slotCell } from "chamfer/edit";
import { WorldShape } from "chamfer/world";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const LAYERS = 48;
const address = new ChunkAddress(3, [1, 0, 2, 3]);

/** A slot well inside the chunk triangle, which is 153 slots at these settings. */
const SLOT = 60;

let map: CoarseMap;
let shape: WorldShape;
let terrain: TerrainGenerator;

beforeAll(() => {
	map = buildCoarseMap(seedFromString("chamfer"), {
		level: 6,
		cellMetres: 100,
		relief: 100,
	});
	shape = new WorldShape(1700, DEPTH, 150, LAYERS);
	terrain = new TerrainGenerator(map.seed, shape, map);
});

function chunkAt(at: TerrainGenerator, address: ChunkAddress) {
	return generateChunk(at, address, CHUNK_LEVEL, LAYERS);
}

/** The same world sampled `lod` levels coarser. */
function coarseChunk(lod: number) {
	const coarse = shape.atLod(lod);
	return generateChunk(
		new TerrainGenerator(map.seed, coarse, map),
		address,
		CHUNK_LEVEL,
		coarse.crustDepth,
	);
}

describe("applyDeltas", () => {
	it("writes a placed block and a broken one into the chunk", () => {
		const plain = chunkAt(terrain, address);
		const patched = chunkAt(terrain, address);

		// pick a real cell of this chunk, and the layer its ground stands at
		const cell = slotCell(address.key, SLOT, 0, DEPTH, CHUNK_LEVEL);
		const column = plain.columnOf(SLOT);
		const ground = column.first;
		expect(ground).toBeGreaterThan(1);

		const deltas = new ChunkDeltas();
		const above = cellSlot(
			{ ...cell, layer: ground - 1 },
			DEPTH,
			CHUNK_LEVEL,
		);
		deltas.set(above.slot, ground - 1, packBlockState(BlockType.SNOW));
		deltas.set(above.slot, ground, packBlockState(BlockType.AIR));
		applyDeltas(patched, [{ chunkKey: address.key, deltas }], DEPTH, 0);

		expect(patched.blocks[SLOT * LAYERS + ground - 1]).toBe(BlockType.SNOW);
		expect(patched.blocks[SLOT * LAYERS + ground]).toBe(BlockType.AIR);
		expect(plain.blocks[SLOT * LAYERS + ground - 1]).toBe(BlockType.AIR);
	});

	it("moves the column band to the block it placed", () => {
		const chunk = chunkAt(terrain, address);
		const ground = chunk.columnOf(SLOT).first;
		const cell = slotCell(address.key, SLOT, 0, DEPTH, CHUNK_LEVEL);
		const deltas = new ChunkDeltas();
		const at = cellSlot({ ...cell, layer: ground - 2 }, DEPTH, CHUNK_LEVEL);
		deltas.set(at.slot, ground - 2, packBlockState(BlockType.STONE));
		applyDeltas(chunk, [{ chunkKey: address.key, deltas }], DEPTH, 0);
		expect(chunk.columnOf(SLOT).first).toBe(ground - 2);
	});

	it("keeps a placed block visible when the chunk is drawn coarse", () => {
		for (const lod of [1, 2, 3]) {
			const chunk = coarseChunk(lod);
			const before = [...chunk.blocks];

			const cell = slotCell(address.key, SLOT, 0, DEPTH, CHUNK_LEVEL);
			const deltas = new ChunkDeltas();
			const at = cellSlot({ ...cell, layer: 4 }, DEPTH, CHUNK_LEVEL);
			deltas.set(at.slot, 4, packBlockState(BlockType.SNOW));
			applyDeltas(chunk, [{ chunkKey: address.key, deltas }], DEPTH, lod);

			const moved = [...chunk.blocks].filter(
				(b, x) => b !== before[x],
			).length;
			expect(moved, `nothing changed at lod ${lod}`).toBe(1);
			expect([...chunk.blocks]).toContain(BlockType.SNOW);
		}
	});

	it("lets a placed block beat a broken one in the same coarse cell", () => {
		const chunk = coarseChunk(2);
		// two fine cells one step apart fall in the same coarse cell at lod 2
		const base = slotCell(address.key, SLOT, 0, DEPTH, CHUNK_LEVEL);
		const deltas = new ChunkDeltas();
		for (const [di, block] of [
			[0, BlockType.AIR],
			[1, BlockType.SNOW],
			[2, BlockType.AIR],
		] as const) {
			const at = cellSlot(
				{ ...base, i: base.i + di, layer: 8 },
				DEPTH,
				CHUNK_LEVEL,
			);
			deltas.set(at.slot, 8, packBlockState(block));
		}
		applyDeltas(chunk, [{ chunkKey: address.key, deltas }], DEPTH, 2);
		expect([...chunk.blocks]).toContain(BlockType.SNOW);
	});

	it("writes bedrock under every column and never above it", () => {
		const chunk = chunkAt(terrain, address);
		for (let slot = 0; slot < chunk.slots; slot++) {
			expect(chunk.blocks[slot * LAYERS + LAYERS - 1]).toBe(
				BlockType.BEDROCK,
			);
			for (let layer = 0; layer < LAYERS - 1; layer++)
				expect(chunk.blocks[slot * LAYERS + layer]).not.toBe(
					BlockType.BEDROCK,
				);
		}
	});
});
