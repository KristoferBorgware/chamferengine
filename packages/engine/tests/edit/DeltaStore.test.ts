import { describe, expect, it } from "vitest";
import {
	BlockRegistry,
	DeltaStore,
	STORE_VERSION,
	cellSlot,
	coarseCell,
	packBlockState,
	rotationOf,
	slotCell,
	typeOf,
	worldKey,
} from "chamfer/edit";
import { cellKey, directionToCell, latticePosition } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

const header = (subdivisionDepth: number, chunkLevel: number) => ({
	version: STORE_VERSION,
	subdivisionDepth,
	chunkLevel,
	registry: ["chamfer:air", "chamfer:stone"],
});

describe("block state", () => {
	it("carries a type and a rotation in sixteen bits", () => {
		for (const type of [0, 1, 7, 4095])
			for (const rotation of [0, 3, 5, 15]) {
				const state = packBlockState(type, rotation);
				expect(state).toBeLessThan(1 << 16);
				expect(typeOf(state)).toBe(type);
				expect(rotationOf(state)).toBe(rotation);
			}
	});
});

describe("cellSlot", () => {
	it("round-trips every cell of a chunk at every cut", () => {
		const depth = 6;
		for (const chunkLevel of [1, 2, 3, 4, 5]) {
			const n = 1 << depth;
			let checked = 0;
			for (let i = 0; i <= n; i += 3)
				for (let j = 0; i + j <= n; j += 3) {
					const cell = { face: 7, i, j, layer: 11 };
					const { chunkKey, slot } = cellSlot(
						cell,
						depth,
						chunkLevel,
					);
					const back = slotCell(
						chunkKey,
						slot,
						11,
						depth,
						chunkLevel,
					);
					expect(back).toEqual(cell);
					checked++;
				}
			expect(checked).toBeGreaterThan(100);
		}
	});
});

describe("DeltaStore", () => {
	it("reads back what it wrote, and the last write wins", () => {
		const store = new DeltaStore(header(11, 5));
		const cell = { face: 3, i: 900, j: 400, layer: 40 };
		store.write(cell, packBlockState(1));
		expect(typeOf(store.read(cell)!)).toBe(1);
		store.write(cell, packBlockState(4));
		expect(typeOf(store.read(cell)!)).toBe(4);
		// One record per chunk whose triangle holds the cell: one for an
		// interior cell, two or three on a chunk border.
		expect(store.count).toBeLessThanOrEqual(3);
	});

	it("distinguishes a cell mined out from a cell never touched", () => {
		const store = new DeltaStore(header(11, 5));
		const dug = { face: 0, i: 10, j: 10, layer: 3 };
		const untouched = { face: 0, i: 10, j: 11, layer: 3 };
		store.write(dug, packBlockState(0));
		expect(store.read(dug)).toBe(0);
		expect(store.read(untouched)).toBeUndefined();
	});

	it("keeps every edit through a change of chunk size", () => {
		const depth = 8;
		const cells = [];
		let seed = 7;
		for (let e = 0; e < 400; e++) {
			seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
			const i = seed % (1 << depth);
			seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
			const j = seed % ((1 << depth) - i + 1);
			seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
			cells.push({
				cell: { face: e % 20, i, j, layer: seed % 64 },
				state: packBlockState((e % 6) + 1),
			});
		}
		let store = new DeltaStore(header(depth, 2));
		for (const { cell, state } of cells) store.write(cell, state);

		// The record count moves with the cut, because how many cells sit on a
		// chunk border depends on how big a chunk is. What must not move is
		// what any cell reads.
		for (const to of [3, 5, 6, 4, 2]) {
			store = store.recut(to);
			expect(store.header.chunkLevel).toBe(to);
			for (const { cell, state } of cells)
				expect(store.read(cell)).toBe(state);
		}
	});

	it("names the chunks an edit landed in, so only those are rebuilt", () => {
		const store = new DeltaStore(header(11, 5));
		const a = store.write({ face: 2, i: 100, j: 100, layer: 1 }, 1);
		const b = store.write({ face: 2, i: 101, j: 100, layer: 1 }, 1);
		const far = store.write({ face: 9, i: 100, j: 100, layer: 1 }, 1);
		expect(a).toEqual(b);
		expect(far.some((key) => a.includes(key))).toBe(false);
	});

	it("reaches every chunk that reads a cell on a chunk border", () => {
		const depth = 8;
		const chunkLevel = 4;
		const store = new DeltaStore(header(depth, chunkLevel));
		const m = 1 << (depth - chunkLevel);
		// a lattice point on the boundary between two chunk triangles
		const onBorder = { face: 5, i: m, j: 3, layer: 6 };
		const keys = store.write(onBorder, packBlockState(3));
		expect(keys.length).toBeGreaterThan(1);
		for (const key of keys) {
			const row = store.rowOf(key)!;
			expect(row.size).toBe(1);
		}
		expect(store.read(onBorder)).toBe(packBlockState(3));
	});
});

describe("BlockRegistry", () => {
	it("appends and never reuses a number", () => {
		const registry = new BlockRegistry(["chamfer:air", "chamfer:stone"]);
		expect(registry.numberOf("chamfer:stone")).toBe(1);
		expect(registry.numberOf("chamfer:grass")).toBe(2);
		expect(registry.numberOf("chamfer:grass")).toBe(2);
		expect(registry.nameOf(0)).toBe("chamfer:air");
	});

	it("accepts a shorter stored list and refuses a reordered one", () => {
		const build = new BlockRegistry(["air", "stone", "dirt"]);
		expect(build.agreesWith(["air", "stone"])).toBe(true);
		expect(build.agreesWith(["air", "stone", "dirt"])).toBe(true);
		expect(build.agreesWith(["air", "dirt", "stone"])).toBe(false);
		expect(build.agreesWith(["air", "stone", "dirt", "sand"])).toBe(false);
	});
});

describe("worldKey", () => {
	it("gives one name whatever order the knobs arrive in", () => {
		expect(worldKey({ seed: "a", depth: 11 })).toBe(
			worldKey({ depth: 11, seed: "a" }),
		);
		expect(worldKey({ seed: "a", depth: 11 })).not.toBe(
			worldKey({ seed: "a", depth: 12 }),
		);
	});
});

describe("coarseCell", () => {
	it("lands where a position lookup at the coarse level lands", () => {
		const depth = 8;
		const n = 1 << depth;
		for (const lod of [1, 2, 3, 4]) {
			const coarseN = n >> lod;
			let checked = 0;
			let agreed = 0;
			for (let face = 0; face < 20; face += 3)
				for (let i = 0; i <= n; i += 7)
					for (let j = 0; i + j <= n; j += 7) {
						const cell = { face, i, j, layer: 40 };
						const mapped = coarseCell(cell, depth, lod);
						const at = latticePosition(face, n, i, j);
						const truth = directionToCell(
							new Vec3(at.x, at.y, at.z).normalize(),
							coarseN,
						);
						checked++;
						if (
							cellKey(
								mapped.face,
								coarseN,
								mapped.i,
								mapped.j,
							) === cellKey(truth.face, coarseN, truth.i, truth.j)
						)
							agreed++;
					}
			// Where they differ the fine cell sits exactly on the boundary
			// between two coarse cells and both are the same distance away.
			expect(agreed / checked).toBeGreaterThan(0.6);
			expect(checked).toBeGreaterThan(500);
		}
	});

	it("halves the layer per level, from a crust top that does not move", () => {
		expect(coarseCell({ face: 0, i: 8, j: 8, layer: 40 }, 8, 2).layer).toBe(
			10,
		);
		expect(coarseCell({ face: 0, i: 8, j: 8, layer: 7 }, 8, 3).layer).toBe(
			0,
		);
	});
});
