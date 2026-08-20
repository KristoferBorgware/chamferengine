import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
	selectionId,
} from "chamfer/generation";
import { InlineMeshSource, MeshWorkerCore, buildChunkMesh } from "chamfer/mesh";
import { WorldShape } from "chamfer/world";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const LAYERS = 40;
const SEED = seedFromString("worker");

let map: CoarseMap;
let shape: WorldShape;

beforeAll(() => {
	shape = new WorldShape(1700, DEPTH, 150, LAYERS);
	map = buildCoarseMap(SEED, { level: 5 });
});

function setup() {
	return {
		kind: "setup",
		map: map.toSnapshot(),
		seaLevelRadius: 1700,
		subdivisionDepth: DEPTH,
		maxElevation: 150,
		crustDepth: LAYERS,
		apron: true,
		terrain: {},
	} as const;
}

/** What the calling thread would have produced for one selection. */
function here(key: number, chunkLevel: number, lod: number) {
	const at = shape.atLod(lod);
	const terrain = new TerrainGenerator(SEED, at, map);
	const chunk = generateChunk(
		terrain,
		ChunkAddress.fromKey(key, chunkLevel),
		chunkLevel,
		at.crustDepth,
	);
	return buildChunkMesh(
		chunk,
		new ChunkColumnSampler(chunk, terrain),
		at,
		SEED,
		{ apron: true, surfaceGrid: shape.blockSize },
	);
}

describe("the grid: a flat shell in place of the terrain", () => {
	const GRID = { levels: true, cells: true, chunks: true, faces: true };

	it("builds every vertex at the crust top, one cap per cell", () => {
		// The world's highest point, for every tile: one radius, so the shell
		// is exactly a sphere and the grid is the only thing it shows.
		const core = new MeshWorkerCore({ ...setup(), grid: GRID });
		const mesh = core.run({
			kind: "chunk",
			id: 1,
			key: 7,
			chunkLevel: CHUNK_LEVEL,
			lod: 0,
		});
		expect(mesh.opaque.indices.length).toBeGreaterThan(0);
		expect(mesh.translucent.indices.length).toBe(0);
		// One cap per drawn cell and nothing else: the owned cells and the
		// apron ring, with no side faces anywhere on a shell of one height.
		expect(mesh.tally.faces).toBe(mesh.tally.cells + mesh.tally.apron);

		const top = shape.crustTopRadius;
		// Six floats a vertex: position then color.
		for (let at = 0; at + 2 < mesh.opaque.vertices.length; at += 6) {
			const x = mesh.opaque.vertices[at]! + mesh.origin[0];
			const y = mesh.opaque.vertices[at + 1]! + mesh.origin[1];
			const z = mesh.opaque.vertices[at + 2]! + mesh.origin[2];
			const radius = Math.sqrt(x * x + y * y + z * z);
			// The apron ring sits a centimetre low by design, and positions
			// are float32 against the chunk origin.
			expect(Math.abs(radius - top)).toBeLessThan(0.02);
		}
	});

	it("draws a coarse chunk in a different color from a fine one", () => {
		// Marks off, or the first cell -- a chunk corner, which is boundary
		// by definition -- wears the chunk mark instead of the ramp.
		const core = new MeshWorkerCore({
			...setup(),
			grid: { levels: true, cells: false, chunks: false, faces: false },
		});
		const fine = core.run({
			kind: "chunk",
			id: 1,
			key: 7,
			chunkLevel: CHUNK_LEVEL,
			lod: 0,
		});
		const coarse = core.run({
			kind: "chunk",
			id: 2,
			key: 0,
			chunkLevel: 0,
			lod: CHUNK_LEVEL,
		});
		// Color sits after position in the vertex layout; compare the first
		// vertex's green and blue, where the ramp's two ends part.
		const g = (mesh: typeof fine) => mesh.opaque.vertices[4]!;
		const b = (mesh: typeof fine) => mesh.opaque.vertices[5]!;
		expect(g(fine)).toBeGreaterThan(b(fine));
		expect(b(coarse)).toBeGreaterThan(g(coarse));
	});

	it("changes nothing when the grid is not asked for", () => {
		const plain = new MeshWorkerCore(setup());
		const mesh = plain.run({
			kind: "chunk",
			id: 1,
			key: 7,
			chunkLevel: CHUNK_LEVEL,
			lod: 0,
		});
		const expected = here(7, CHUNK_LEVEL, 0);
		expect(mesh.opaque.vertices).toEqual(expected.opaque.vertices);
	});
});

describe("MeshWorkerCore", () => {
	it("produces what the calling thread would have produced", () => {
		// The worker half holds no logic of its own: it rebuilds the generator
		// from the snapshot and runs the same functions. This is the check that
		// the snapshot carries everything the generator reads.
		const core = new MeshWorkerCore(setup());
		const result = core.run({
			kind: "chunk",
			id: 1,
			key: 512,
			chunkLevel: CHUNK_LEVEL,
			lod: 0,
		});
		const mine = here(512, CHUNK_LEVEL, 0);
		expect(result.key).toBe(512);
		expect(result.opaque.vertices).toEqual(mine.opaque.vertices);
		expect(result.opaque.indices).toEqual(mine.opaque.indices);
		expect(result.translucent.vertices).toEqual(mine.translucent.vertices);
		expect(result.tally).toEqual(mine.tally);
		expect(result.origin).toEqual([
			mine.origin.x,
			mine.origin.y,
			mine.origin.z,
		]);
	});

	it("meshes a coarse chunk at the level it was asked for", () => {
		const core = new MeshWorkerCore(setup());
		const result = core.run({
			kind: "chunk",
			id: 2,
			key: 12,
			chunkLevel: CHUNK_LEVEL - 2,
			lod: 2,
		});
		const mine = here(12, CHUNK_LEVEL - 2, 2);
		expect(result.tally).toEqual(mine.tally);
		expect(result.opaque.vertices).toEqual(mine.opaque.vertices);
	});

	it("hands back exactly the four buffers a caller transfers", () => {
		const core = new MeshWorkerCore(setup());
		const result = core.run({
			kind: "chunk",
			id: 3,
			key: 33,
			chunkLevel: CHUNK_LEVEL,
			lod: 0,
		});
		const buffers = MeshWorkerCore.buffers(result);
		expect(buffers.length).toBe(4);
		// Blocks never cross back. A chunk is 478 KB of them at the worked
		// planet's crust and the thread that draws has no use for any of it.
		expect(new Set(buffers).size).toBe(4);
	});
});

describe("InlineMeshSource", () => {
	it("returns the mesh the selection names, keyed by level and key", async () => {
		const source = new InlineMeshSource(setup());
		const mesh = await source.request({
			lod: 0,
			chunkLevel: CHUNK_LEVEL,
			key: 300,
			distance: 40,
		});
		expect(mesh.key).toBe(selectionId(CHUNK_LEVEL, 300));
		expect(mesh.opaque.triangleCount).toBeGreaterThan(0);
		source.dispose();
	});
});
