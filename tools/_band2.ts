/** Same differential, at coarse levels, and for shafts across a seam. */
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
} from "../packages/engine/src/generation/index.js";
import {
	DeltaStore,
	STORE_VERSION,
	packBlockState,
} from "../packages/engine/src/edit/index.js";
import { buildChunkMesh } from "../packages/engine/src/mesh/index.js";
import { joinPath, neighbour } from "../packages/engine/src/addressing/index.js";
import { WorldShape } from "../packages/engine/src/world/index.js";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const LAYERS = 60;
const N = 1 << DEPTH;
const M = 1 << (DEPTH - CHUNK_LEVEL);

const map = buildCoarseMap(seedFromString("chamfer"), {
	level: 6,
	cellMetres: 100,
	relief: 100,
});
const baseShape = new WorldShape(1700, DEPTH, 150, LAYERS);
const gens = new Map<number, TerrainGenerator>();
const gen = (lod: number) => {
	let g = gens.get(lod);
	if (!g) {
		g = new TerrainGenerator(map.seed, baseShape.atLod(lod), map);
		gens.set(lod, g);
	}
	return g;
};

const header = {
	version: STORE_VERSION,
	subdivisionDepth: DEPTH,
	chunkLevel: CHUNK_LEVEL,
	registry: ["chamfer:air", "chamfer:stone"],
};

const fine = new ChunkAddress(3, [1, 2, 0, 3]);
const fineKey = fine.key;

function fineCells() {
	const mine: { face: number; i: number; j: number }[] = [];
	const seen = new Set<string>();
	for (let q = 0; q <= M; q++)
		for (let r = 0; q + r <= M; r++) {
			const [i, j] = joinPath(fine.path, q, r, DEPTH);
			mine.push({ face: fine.face, i, j });
			seen.add(`${fine.face}:${i}:${j}`);
		}
	const out: { face: number; i: number; j: number }[] = [];
	for (const c of mine)
		for (let k = 0; k < 6; k++) {
			const nb = neighbour(c.face, N, c.i, c.j, k);
			if (!nb) continue;
			const name = `${nb.face}:${nb.i}:${nb.j}`;
			if (seen.has(name)) continue;
			seen.add(name);
			out.push(nb);
		}
	return { mine, out };
}

function positions(g: { vertices: Float32Array; indices: Uint32Array }) {
	const tri: string[] = [];
	for (let t = 0; t < g.indices.length; t += 3) {
		const p: string[] = [];
		for (let c = 0; c < 3; c++) {
			const v = g.indices[t + c]! * 6;
			p.push(
				`${g.vertices[v]!.toFixed(4)},${g.vertices[v + 1]!.toFixed(4)},${g.vertices[v + 2]!.toFixed(4)}`,
			);
		}
		tri.push(p.join("|"));
	}
	tri.sort();
	return tri;
}

const widen = (s: ChunkColumnSampler, layers: number) => ({
	columnAt: (face: number, i: number, j: number) => ({
		...s.columnAt(face, i, j),
		first: 0,
		last: layers - 1,
	}),
});

function runAt(
	label: string,
	lod: number,
	edits: [{ face: number; i: number; j: number }, number, BlockType][],
) {
	const store = new DeltaStore(header);
	for (const [cell, layer, block] of edits)
		store.write({ ...cell, layer }, packBlockState(block));

	const chunkLevel = CHUNK_LEVEL - lod;
	const key = coarseChunkKey(fineKey, CHUNK_LEVEL, chunkLevel);
	const address = ChunkAddress.fromKey(key, chunkLevel);
	const shape = baseShape.atLod(lod);
	const rows = store.rowsUnder(key, chunkLevel);

	const build = (full: boolean) => {
		const chunk = generateChunk(
			gen(lod),
			address,
			chunkLevel,
			shape.crustDepth,
		);
		const outside = applyDeltas(chunk, rows, DEPTH, lod);
		const s = new ChunkColumnSampler(chunk, gen(lod), outside);
		return buildChunkMesh(
			chunk,
			(full ? widen(s, shape.crustDepth) : s) as never,
			shape,
			map.seed,
			{ apron: true, crustFloor: true, surfaceGrid: baseShape.blockSize },
		);
	};
	const pa = positions(build(false).opaque);
	const pb = positions(build(true).opaque);
	const setA = new Set(pa);
	const missing = pb.filter((t) => !setA.has(t));
	console.log(
		`lod ${lod} ${label}: rows ${rows.length}, banded ${pa.length}, full ${pb.length}, missing ${missing.length}`,
	);
	if (missing.length) console.log("   e.g.", missing[0]);
}

const { mine, out } = fineCells();

for (let lod = 0; lod <= 4; lod++) {
	runAt("no edits", lod, []);
	runAt(
		"deep break inside",
		lod,
		Array.from({ length: 20 }, (_, n) => [
			mine[(n * 37) % mine.length]!,
			LAYERS - 5,
			BlockType.AIR,
		]) as never,
	);
	runAt(
		"shaft inside",
		lod,
		Array.from({ length: LAYERS - 2 }, (_, layer) => [
			mine[80]!,
			layer,
			BlockType.AIR,
		]) as never,
	);
	runAt(
		"deep break outside",
		lod,
		out
			.slice(0, 20)
			.map((c) => [c, LAYERS - 5, BlockType.AIR]) as never,
	);
	runAt(
		"tower outside",
		lod,
		out.slice(0, 20).flatMap((c) =>
			[0, 1, 2, 3].map((l) => [c, l, BlockType.STONE]),
		) as never,
	);
}
