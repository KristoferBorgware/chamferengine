/** Differential probe: does the band ever hide a face the full walk emits? */
import {
	BlockType,
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	applyDeltas,
	buildCoarseMap,
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
const shape = new WorldShape(1700, DEPTH, 150, LAYERS);
const terrain = new TerrainGenerator(map.seed, shape, map);

const header = {
	version: STORE_VERSION,
	subdivisionDepth: DEPTH,
	chunkLevel: CHUNK_LEVEL,
	registry: ["chamfer:air", "chamfer:stone"],
};

const address = new ChunkAddress(3, [1, 2, 0, 3]);
const key = address.key;

/** every cell of the triangle, plus the ring one step out */
function cells() {
	const mine: { face: number; i: number; j: number }[] = [];
	const seen = new Set<string>();
	for (let q = 0; q <= M; q++)
		for (let r = 0; q + r <= M; r++) {
			const [i, j] = joinPath(address.path, q, r, DEPTH);
			mine.push({ face: address.face, i, j });
			seen.add(`${address.face}:${i}:${j}`);
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

function widen(s: ChunkColumnSampler, layers: number) {
	return {
		columnAt(face: number, i: number, j: number) {
			const c = s.columnAt(face, i, j);
			return { ...c, first: 0, last: layers - 1 };
		},
	};
}

function run(label: string, edits: [{ face: number; i: number; j: number }, number, BlockType][]) {
	const store = new DeltaStore(header);
	for (const [cell, layer, block] of edits)
		store.write({ ...cell, layer }, packBlockState(block));
	const rows = store.rowsFor(key);
	const chunk = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
	const outside = applyDeltas(chunk, rows, DEPTH, 0);
	const sampler = new ChunkColumnSampler(chunk, terrain, outside);
	const a = buildChunkMesh(chunk, sampler, shape, map.seed, { apron: true, crustFloor: true });

	const chunk2 = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
	const outside2 = applyDeltas(chunk2, rows, DEPTH, 0);
	const s2 = new ChunkColumnSampler(chunk2, terrain, outside2);
	const b = buildChunkMesh(chunk2, widen(s2, LAYERS) as never, shape, map.seed, {
		apron: true,
		crustFloor: true,
	});

	const pa = positions(a.opaque);
	const pb = positions(b.opaque);
	const setA = new Set(pa);
	const setB = new Set(pb);
	const missing = pb.filter((t) => !setA.has(t));
	const extra = pa.filter((t) => !setB.has(t));
	console.log(
		`${label}: banded ${pa.length} tris, full ${pb.length} tris, missing ${missing.length}, extra ${extra.length}`,
	);
	if (missing.length) console.log("   first missing:", missing[0]);
	return { missing, extra };
}

const { mine, out } = cells();
run("no edits", []);

// deep breaks inside the chunk
{
	const edits: [{ face: number; i: number; j: number }, number, BlockType][] = [];
	for (let n = 0; n < 20; n++) {
		const c = mine[(n * 37) % mine.length]!;
		edits.push([c, LAYERS - 5, BlockType.AIR]);
	}
	run("deep break inside", edits);
}

// deep breaks one step outside the rim
{
	const edits: [{ face: number; i: number; j: number }, number, BlockType][] = [];
	for (let n = 0; n < Math.min(20, out.length); n++)
		edits.push([out[n]!, LAYERS - 5, BlockType.AIR]);
	run("deep break outside", edits);
}

// blocks placed high above the ground, inside
{
	const edits: [{ face: number; i: number; j: number }, number, BlockType][] = [];
	for (let n = 0; n < 20; n++)
		edits.push([mine[(n * 37) % mine.length]!, 1, BlockType.STONE]);
	run("place at layer 1 inside", edits);
}

// blocks placed high above the ground, outside
{
	const edits: [{ face: number; i: number; j: number }, number, BlockType][] = [];
	for (let n = 0; n < Math.min(20, out.length); n++)
		edits.push([out[n]!, 1, BlockType.STONE]);
	run("place at layer 1 outside", edits);
}
