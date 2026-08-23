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
	offsetIn,
	packBlockState,
} from "chamfer/edit";
import { buildChunkMesh } from "chamfer/mesh";
import { joinPath, neighbour, rank } from "chamfer/addressing";
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
			expect(generated.groundRadius).toBe(held.groundRadius);
			expect(generated.waterRadius).toBe(held.waterRadius);
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
			// **The coarse crust depth, not the finest.** Layers double in
			// height with the cells, so `atLod` halves the count -- and
			// `MeshWorkerCore` passes that. Handing the finest count models a
			// chunk the worker never builds, and every layer-bounded branch on
			// the coarse path then runs at a value production never sees.
			chunk: generateChunk(terrain, at, level, shrunk.crustDepth),
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

// **A chunk HOLDS every cell of its triangle and OWNS only some of them, and
// the two are different questions.** The border rule awards a shared cell to
// the lowest chunk key, and that decides only who draws it. A chunk generates
// and patches a slot for every cell it holds -- that is the whole reason it can
// mesh its rim without fetching a neighbour.
//
// Asking the ownership question when serving column data made a chunk
// regenerate its own rim from the seed while holding a patched slot for it, so
// an edit on a seam was written into the array and then read back from the
// generator. The neighbour's apron went on drawing the broken block's cap, and
// its rim cells were told there was rock where the tunnel was.
describe("a chunk's own rim", () => {
	const address = new ChunkAddress(3, [1, 2, 0, 3]);

	/** Every cell of this chunk's triangle, with its slot. */
	function heldCells() {
		const out: { i: number; j: number; slot: number }[] = [];
		for (let q = 0; q <= M; q++)
			for (let r = 0; q + r <= M; r++) {
				const [i, j] = joinPath(address.path, q, r, DEPTH);
				out.push({
					i,
					j,
					slot: rank(q, r, M),
				});
			}
		return out;
	}

	// The invariant the whole scheme rests on, stated over every cell rather
	// than one: what the sampler serves for a cell this chunk holds IS this
	// chunk's own column for it. Anything else means the mesher decides from
	// data the chunk itself does not hold.
	it("is served from the chunk's own array, not regenerated", () => {
		const store = new DeltaStore(header());
		const chunk = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);

		// Dig three layers out of every cell of the triangle, rim included.
		let dug = 0;
		for (const cell of heldCells()) {
			const ground = chunk.columnOf(cell.slot).first;
			if (ground < 0 || ground >= LAYERS - 4) continue;
			for (let down = 0; down < 3; down++)
				store.write(
					{ face: 3, i: cell.i, j: cell.j, layer: ground + down },
					packBlockState(BlockType.AIR),
				);
			dug++;
		}
		expect(dug).toBeGreaterThan(100);

		const patched = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
		const outside = applyDeltas(
			patched,
			store.rowsFor(address.key),
			DEPTH,
			0,
		);
		const sampler = new ChunkColumnSampler(patched, terrain, outside);

		for (const cell of heldCells()) {
			const held = patched.columnOf(cell.slot);
			const served = sampler.columnAt(3, cell.i, cell.j);
			expect(
				[...served.blocks],
				`cell ${cell.i}:${cell.j} (slot ${cell.slot})`,
			).toEqual([...held.blocks]);
			expect(served.first).toBe(held.first);
			expect(served.last).toBe(held.last);
			// The radii too: the mesher snaps the surface cap to them, so two
			// chunks disagreeing about them draw one hillside at two heights.
			expect(served.groundRadius).toBe(held.groundRadius);
			expect(served.waterRadius).toBe(held.waterRadius);
		}
	});

	// The symptom, directly: breaking a block this chunk holds but a
	// neighbour owns has to change what this chunk draws, because its apron
	// is what draws that cell's cap.
	it("stops drawing the cap of a broken block it holds but does not own", () => {
		const store = new DeltaStore(header());
		const chunk = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);

		// A rim cell: held by this chunk, owned by another.
		const [i, j] = joinPath(address.path, 0, 3, DEPTH);
		const owner = cellSlot(
			{ face: 3, i, j, layer: 0 },
			DEPTH,
			CHUNK_LEVEL,
		).chunkKey;
		expect(owner).not.toBe(address.key);
		expect(
			chunksHolding({ face: 3, i, j, layer: 0 }, DEPTH, CHUNK_LEVEL).map(
				(h) => h.chunkKey,
			),
		).toContain(address.key);

		const ground = chunk.columnOf(rank(0, 3, M)).first;
		expect(ground).toBeGreaterThan(0);
		expect(ground).toBeLessThan(LAYERS - 2);

		const before = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, terrain),
			shape,
			map.seed,
			{ apron: true },
		);

		store.write(
			{ face: 3, i, j, layer: ground },
			packBlockState(BlockType.AIR),
		);
		const dug = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
		const outside = applyDeltas(dug, store.rowsFor(address.key), DEPTH, 0);
		const after = buildChunkMesh(
			dug,
			new ChunkColumnSampler(dug, terrain, outside),
			shape,
			map.seed,
			{ apron: true },
		);

		expect([...after.opaque.vertices]).not.toEqual([
			...before.opaque.vertices,
		]);
	});
});

// **THE SEAM INVARIANT.** Two chunks that both hold a cell each generate it
// themselves rather than fetching it, which is only sound while the two agree.
// Terrain is a pure function of the address so the seed halves always agree;
// a player's changes are not, so the agreement has to survive them. Where it
// does not, the two sides of a seam disagree about whether there is a block
// there -- one draws a cap the other has removed, and one emits a wall the
// other does not, which is a hole to see the sky through.
describe("two chunks sharing a cell", () => {
	const address = new ChunkAddress(3, [1, 2, 0, 3]);

	it("serve the same column for it, before and after an edit", () => {
		const store = new DeltaStore(header());
		const mine = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);

		// Every cell of this chunk's rim, and every other chunk holding it.
		const shared: { i: number; j: number; others: number[] }[] = [];
		for (let q = 0; q <= M; q++)
			for (let r = 0; q + r <= M; r++) {
				if (q > 0 && r > 0 && q + r < M) continue;
				const [i, j] = joinPath(address.path, q, r, DEPTH);
				const others = chunksHolding(
					{ face: 3, i, j, layer: 0 },
					DEPTH,
					CHUNK_LEVEL,
				)
					.map((h) => h.chunkKey)
					.filter((key) => key !== address.key);
				if (others.length > 0) shared.push({ i, j, others });
			}
		expect(shared.length).toBeGreaterThan(20);

		// Dig every one of them out, three layers deep.
		for (const cell of shared) {
			const at = cellSlot(
				{ face: 3, i: cell.i, j: cell.j, layer: 0 },
				DEPTH,
				CHUNK_LEVEL,
			);
			const ground = mine.columnOf(
				rank(
					offsetIn(address.path, cell.i, cell.j, DEPTH)!.q,
					offsetIn(address.path, cell.i, cell.j, DEPTH)!.r,
					M,
				),
			).first;
			if (ground < 0 || ground >= LAYERS - 4) continue;
			void at;
			for (let down = 0; down < 3; down++)
				store.write(
					{ face: 3, i: cell.i, j: cell.j, layer: ground + down },
					packBlockState(BlockType.AIR),
				);
		}

		/** One chunk's sampler, built the way the worker builds it. */
		const samplerFor = (key: number) => {
			const at = ChunkAddress.fromKey(key, CHUNK_LEVEL);
			const chunk = generateChunk(terrain, at, CHUNK_LEVEL, LAYERS);
			const outside = applyDeltas(chunk, store.rowsFor(key), DEPTH, 0);
			return new ChunkColumnSampler(chunk, terrain, outside);
		};

		const ours = samplerFor(address.key);
		let compared = 0;
		for (const cell of shared)
			for (const other of cell.others) {
				const theirs = samplerFor(other);
				const a = ours.columnAt(3, cell.i, cell.j);
				const b = theirs.columnAt(3, cell.i, cell.j);
				expect(
					[...b.blocks],
					`chunk ${other} disagrees about ${cell.i}:${cell.j}`,
				).toEqual([...a.blocks]);
				expect(b.first).toBe(a.first);
				expect(b.last).toBe(a.last);
				expect(
					b.groundRadius,
					`chunk ${other} snaps ${cell.i}:${cell.j} elsewhere`,
				).toBe(a.groundRadius);
				expect(b.waterRadius).toBe(a.waterRadius);
				compared++;
			}
		expect(compared).toBeGreaterThan(20);
	});
});
