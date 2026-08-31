import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	BlockType,
	buildCoarseMap,
	maxElevationFor,
	coarseChunkKey,
	generateChunk,
	seedFromString,
	selectionId,
} from "chamfer/generation";
import {
	DeltaStore,
	STORE_VERSION,
	cellSlot,
	packBlockState,
} from "chamfer/edit";
import { joinPath, neighbour } from "chamfer/addressing";
import {
	CAVE_DETAIL_REACH,
	CHUNK_VERTEX_FLOATS,
	InlineMeshSource,
	MeshWorkerCore,
	buildChunkMesh,
} from "chamfer/mesh";
import { WorldShape } from "chamfer/world";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const LAYERS = 40;
const SEED = seedFromString("worker");

let map: CoarseMap;
let shape: WorldShape;

/**
 * A world whose ground fits the crust the shape below has.
 *
 * The height is no longer fitted to its own peak, so the ground spans
 * `-(seaDepth + peakRelief)` to `relief + peakRelief` and a fixture has to say
 * both halves. At this depth a block is about 4 m and the crust is 40 of them,
 * so there are 160 m of it: `120` above the waterline and `40` below.
 */
const MAP = { level: 5, relief: 100, peakRelief: 20, seaDepth: 20 } as const;
const MAX_ELEVATION = maxElevationFor(MAP);

beforeAll(() => {
	shape = new WorldShape(1700, DEPTH, MAX_ELEVATION, LAYERS);
	map = buildCoarseMap(SEED, MAP);
});

function setup() {
	return {
		kind: "setup",
		map: map.toSnapshot(),
		seaLevelRadius: 1700,
		subdivisionDepth: DEPTH,
		maxElevation: MAX_ELEVATION,
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
		for (
			let at = 0;
			at + 2 < mesh.opaque.vertices.length;
			at += CHUNK_VERTEX_FLOATS
		) {
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

	it("carves the caves at the finest levels and not past them", () => {
		// **The gate sits where the per-level generator is made**, so the one
		// observable is the mesh: a chunk inside {@link CAVE_DETAIL_REACH}
		// differs from a caveless world's, and a chunk past it is that
		// caveless chunk to the bit -- the walk was never run for it.
		const caved = {
			caves: true,
			caveThreshold: 0.3,
			caveCeiling: 4,
			caveDepth: 100,
		};
		const withCaves = new MeshWorkerCore({
			...setup(),
			terrain: caved,
		});
		const without = new MeshWorkerCore(setup());
		const job = (id: number, lod: number) =>
			({
				kind: "chunk",
				id,
				key: 12,
				chunkLevel: CHUNK_LEVEL - lod,
				lod,
			}) as const;
		for (const lod of [0, CAVE_DETAIL_REACH]) {
			const on = withCaves.run(job(1, lod));
			const off = without.run(job(2, lod));
			expect(on.opaque.vertices).not.toEqual(off.opaque.vertices);
		}
		const past = CAVE_DETAIL_REACH + 1;
		const on = withCaves.run(job(3, past));
		const off = without.run(job(4, past));
		expect(on.opaque.vertices).toEqual(off.opaque.vertices);
		expect(on.opaque.indices).toEqual(off.opaque.indices);
		expect(on.tally).toEqual(off.tally);
	});

	it("hands back exactly the six buffers a caller transfers", () => {
		const core = new MeshWorkerCore(setup());
		const result = core.run({
			kind: "chunk",
			id: 3,
			key: 33,
			chunkLevel: CHUNK_LEVEL,
			lod: 0,
		});
		const buffers = MeshWorkerCore.buffers(result);
		// Vertices and indices for each of opaque, cutout and translucent.
		expect(buffers.length).toBe(6);
		// Blocks never cross back. A chunk is 478 KB of them at the worked
		// planet's crust and the thread that draws has no use for any of it.
		expect(new Set(buffers).size).toBe(6);
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

// The last link of the path an edit takes, through the job the pool actually
// posts. The store is filed at the finest chunk level and a coarse chunk has a
// different key at its own, so the rows have to be asked for by key *and*
// level, and the slots read back against the level they were filed at.
describe("a change carried into a chunk drawn coarse", () => {
	const FINEST = CHUNK_LEVEL;
	const address = new ChunkAddress(3, [1, 2, 0, 3]);

	function store() {
		const at = new DeltaStore({
			version: STORE_VERSION,
			subdivisionDepth: DEPTH,
			chunkLevel: FINEST,
			registry: ["chamfer:air", "chamfer:stone"],
		});
		const terrain = new TerrainGenerator(SEED, shape, map);
		const chunk = generateChunk(terrain, address, FINEST, LAYERS);

		// **A patch of a different material, not a hole.** A coarse cell holds
		// `4 ^ lod` fine cells and reads as air only when every change inside
		// it was a break, so a hole small enough to close up at distance is
		// the intended behaviour rather than a lost edit -- what has to
		// survive to every level is a placed block. Replacing the surface
		// rather than building on it, because this chunk's ground reaches the
		// crust top and there is no sky over it to build in.
		let found: { q: number; r: number; ground: number } | null = null;
		for (let q = 1; q < chunk.m - 4 && !found; q++)
			for (let r = 1; q + r < chunk.m - 4 && !found; r++) {
				const [i, j] = joinPath(address.path, q, r, DEPTH);
				const ground = chunk.columnOf(
					cellSlot({ face: 3, i, j, layer: 0 }, DEPTH, FINEST).slot,
				).first;
				if (ground >= 0 && ground < LAYERS - 4)
					found = { q, r, ground };
			}
		expect(found, "no column with ground in it").not.toBeNull();

		const { q, r, ground } = found!;
		for (let along = 0; along < 4; along++)
			for (let down = 0; down < 3; down++) {
				const [x, y] = joinPath(address.path, q + along, r, DEPTH);
				at.write(
					{ face: 3, i: x, j: y, layer: ground + down },
					packBlockState(BlockType.SNOW),
				);
			}
		return at;
	}

	it("is drawn at every level a selection can pick for it", () => {
		const edits = store();
		const core = new MeshWorkerCore(setup());
		for (const lod of [0, 1, 2, 3]) {
			const chunkLevel = FINEST - lod;
			const key = coarseChunkKey(address.key, FINEST, chunkLevel);
			const rows = edits.rowsUnder(key, chunkLevel).map((row) => ({
				chunkKey: row.chunkKey,
				...row.deltas.pack(),
			}));
			expect(rows.length, `no rows at lod ${lod}`).toBeGreaterThan(0);

			const job = { kind: "chunk", id: 1, key, chunkLevel, lod } as const;
			const plain = core.run(job);
			const changed = core.run({ ...job, id: 2, deltas: rows });
			expect(
				[...changed.opaque.vertices],
				`the same geometry at lod ${lod}`,
			).not.toEqual([...plain.opaque.vertices]);
		}
	});
});

// The mesher leaves out the faces of air nothing can reach (`sealedRuns`), and
// the two claims that make that safe are testable from here: a sealed room
// changes no vertex of the mesh, and the same room with a shaft to the surface
// changes it -- the second is also what proves the deltas actually landed, so
// the first cannot pass by the room never having been dug at all.
describe("a sealed pocket is not drawn", () => {
	const FINEST = CHUNK_LEVEL;
	const address = new ChunkAddress(3, [1, 2, 0, 3]);

	/** A room three blocks tall under three blocks of rock, and its shaft. */
	function dug(shaft: boolean) {
		const at = new DeltaStore({
			version: STORE_VERSION,
			subdivisionDepth: DEPTH,
			chunkLevel: FINEST,
			registry: ["chamfer:air", "chamfer:stone"],
		});
		const terrain = new TerrainGenerator(SEED, shape, map);
		const chunk = generateChunk(terrain, address, FINEST, LAYERS);

		// An interior cell whose ring stands on ground no more than two
		// layers looser than its own: the room sits three layers under this
		// column's surface, so every neighbouring column is rock beside it
		// and the only way in is the shaft.
		let found: { i: number; j: number; ground: number } | null = null;
		for (let q = 2; q < chunk.m - 2 && !found; q++)
			for (let r = 2; q + r < chunk.m - 2 && !found; r++) {
				const [i, j] = joinPath(address.path, q, r, DEPTH);
				const ground = chunk.columnOf(
					cellSlot({ face: 3, i, j, layer: 0 }, DEPTH, FINEST).slot,
				).first;
				if (ground < 0 || ground >= LAYERS - 9) continue;
				let solidRing = true;
				for (let k = 0; k < 6 && solidRing; k++) {
					const nb = neighbour(3, 1 << DEPTH, i, j, k);
					if (!nb || nb.face !== 3) {
						solidRing = false;
						break;
					}
					const theirs = chunk.columnOf(
						cellSlot(
							{ face: 3, i: nb.i, j: nb.j, layer: 0 },
							DEPTH,
							FINEST,
						).slot,
					).first;
					if (theirs < 0 || theirs > ground + 2) solidRing = false;
				}
				if (solidRing) found = { i, j, ground };
			}
		expect(found, "no buriable cell in the fixture").not.toBeNull();

		const { i, j, ground } = found!;
		const air = packBlockState(BlockType.AIR);
		for (let down = 3; down <= 5; down++)
			at.write({ face: 3, i, j, layer: ground + down }, air);
		if (shaft)
			for (let down = 0; down <= 2; down++)
				at.write({ face: 3, i, j, layer: ground + down }, air);
		return at;
	}

	function meshed(edits: DeltaStore | null) {
		const core = new MeshWorkerCore(setup());
		const rows = edits
			? edits.rowsUnder(address.key, FINEST).map((row) => ({
					chunkKey: row.chunkKey,
					...row.deltas.pack(),
				}))
			: undefined;
		if (edits) expect(rows!.length).toBeGreaterThan(0);
		return core.run({
			kind: "chunk",
			id: 1,
			key: address.key,
			chunkLevel: FINEST,
			lod: 0,
			...(rows ? { deltas: rows } : {}),
		});
	}

	it("leaves the mesh of a hidden room byte-identical to no room at all", () => {
		const plain = meshed(null);
		const buried = meshed(dug(false));
		expect(buried.opaque.vertices).toEqual(plain.opaque.vertices);
		expect(buried.opaque.indices).toEqual(plain.opaque.indices);
		expect(buried.tally.faces).toBe(plain.tally.faces);
	});

	it("draws the room the moment a shaft reaches the surface", () => {
		const plain = meshed(null);
		const opened = meshed(dug(true));
		expect(opened.tally.faces).toBeGreaterThan(plain.tally.faces);
	});
});

describe("retuning the switches baked into a vertex colour", () => {
	const JOB = {
		kind: "chunk",
		id: 1,
		key: 512,
		chunkLevel: CHUNK_LEVEL,
		lod: 0,
	} as const;

	// **Speckle is the one of the three this ground shows.** Sky exposure and
	// the corner shading both need somewhere the sky is actually blocked, and
	// open hillside is not: every column here reaches the sky and every corner
	// sees the same neighbours, so both come out flat whichever way they are
	// set. `meshChunk.test.ts` builds a shaft to exercise those two. Speckle
	// varies per cell on any terrain at all, so it is what says a retune
	// reached the mesher.
	const OFF = {
		kind: "retune",
		speckle: 0,
		ambientOcclusion: false,
		skyExposure: false,
		cutoutLeaves: false,
	} as const;
	const ON = { ...OFF, speckle: 0.2 } as const;

	/** The colour half of every vertex, which is where the three land. */
	function colors(vertices: Float32Array): Float32Array {
		const out = new Float32Array(vertices.length / 2);
		for (
			let v = 0, n = 0;
			v < vertices.length;
			v += CHUNK_VERTEX_FLOATS, n += 3
		) {
			out[n] = vertices[v + 3]!;
			out[n + 1] = vertices[v + 4]!;
			out[n + 2] = vertices[v + 5]!;
		}
		return out;
	}

	it("gives what a core built with the same switches gives", () => {
		// The whole of what the cheap path claims: a pool already holding the
		// map can be told these three and build exactly what a pool made from
		// scratch for them would have built. If this ever stops holding, a
		// live rebuild draws a different world from the one a reload does.
		const retuned = new MeshWorkerCore({
			...setup(),
			...OFF,
			kind: "setup",
		});
		retuned.retune(ON);
		const fresh = new MeshWorkerCore({ ...setup(), ...ON, kind: "setup" });
		const mine = retuned.run(JOB).opaque.vertices;
		expect(mine).toEqual(fresh.run(JOB).opaque.vertices);
		// Not vacuous: the two settings really do draw different colours.
		const before = new MeshWorkerCore({
			...setup(),
			...OFF,
			kind: "setup",
		});
		expect(colors(mine)).not.toEqual(
			colors(before.run(JOB).opaque.vertices),
		);
	});

	it("moves the colours and leaves every position where it was", () => {
		// These knobs move no block. The terrain reads a face and a lattice
		// offset and has never been told about one of them, which is what
		// lets the map, the shape and the generators stay exactly as they are
		// while the meshes are built again.
		const core = new MeshWorkerCore({ ...setup(), ...OFF, kind: "setup" });
		const before = core.run(JOB).opaque.vertices.slice();
		core.retune(ON);
		const after = core.run({ ...JOB, id: 2 }).opaque.vertices;

		expect(after.length).toBe(before.length);
		for (let v = 0; v < before.length; v += CHUNK_VERTEX_FLOATS)
			for (let axis = 0; axis < 3; axis++)
				expect(after[v + axis]).toBe(before[v + axis]);
		expect(colors(after)).not.toEqual(colors(before));
	});
});
