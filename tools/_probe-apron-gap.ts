/**
 * End to end: dig a hole TWO cells past a chunk's rim and mesh that chunk the
 * way production does (the rows DeltaStore hands it) against the way it would
 * be meshed if it were handed every row. The apron's own ring[] reads those
 * cells, so anything that differs is the apron drawn from seed-only ground.
 */
import {
	DeltaStore,
	STORE_VERSION,
	chunksReading,
	packBlockState,
} from "chamfer/edit";
import {
	BlockType,
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	applyDeltas,
	buildCoarseMap,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import { ArrayMeshSink, meshChunk } from "chamfer/mesh";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { Vec3 } from "chamfer/math";
import {
	canonicalCell,
	cellCorners,
	joinPath,
	latticeWeights,
	neighbour,
	splitPath,
} from "chamfer/addressing";

const DEPTH = 10;
const CHUNK_LEVEL = 4;
const N = 1 << DEPTH;
const M = 1 << (DEPTH - CHUNK_LEVEL);

const map = buildCoarseMap(seedFromString("chamfer"), {
	level: 6,
	cellMetres: 100,
	relief: 300,
});
const shape = new WorldShape(1700, DEPTH, 400, maxCrustDepth(DEPTH));
const terrain = new TerrainGenerator(map.seed, shape, map);
const LAYERS = shape.crustDepth;

const face = Number(process.env.PFACE ?? 3);
const path = (process.env.PPATH ?? "1,2,0,3").split(",").map(Number);
const address = new ChunkAddress(face, path);
const key = address.key;

const id = (f: number, i: number, j: number) => `${f}:${i}:${j}`;
const inChunk = (i: number, j: number) => {
	const s = splitPath(i, j, DEPTH, CHUNK_LEVEL);
	for (let l = 0; l < s.path.length; l++) if (s.path[l] !== path[l]) return false;
	return true;
};
const owns = (f: number, i: number, j: number) => {
	const w = latticeWeights(N, i, j);
	if (w[0] === 0 || w[1] === 0 || w[2] === 0)
		if (canonicalCell(f, N, i, j).face !== f) return false;
	return inChunk(i, j);
};

// The apron set, exactly as meshChunk builds it.
const apron = new Map<string, { face: number; i: number; j: number }>();
for (let q = 0; q <= M; q++)
	for (let r = 0; q + r <= M; r++) {
		const [i, j] = joinPath(path, q, r, DEPTH);
		if (!owns(face, i, j)) continue;
		const degree = cellCorners(face, N, i, j).length;
		for (let k = 0; k < degree; k++) {
			const nb = neighbour(face, N, i, j, k);
			if (!nb) continue;
			if (nb.face === face && inChunk(nb.i, nb.j) && owns(nb.face, nb.i, nb.j))
				continue;
			const c = canonicalCell(nb.face, N, nb.i, nb.j);
			apron.set(id(c.face, c.i, c.j), c);
		}
	}
const drawn = [...apron.values()].filter(
	(c) => !(c.face === face && inChunk(c.i, c.j)),
);

// The cells the apron's ring[] reads that no edit can reach.
const gap: { face: number; i: number; j: number }[] = [];
const seen = new Set<string>();
for (const cell of drawn) {
	const degree = cellCorners(cell.face, N, cell.i, cell.j).length;
	for (let k = 0; k < degree; k++) {
		const nb = neighbour(cell.face, N, cell.i, cell.j, k);
		if (!nb) continue;
		const tag = id(nb.face, nb.i, nb.j);
		if (seen.has(tag)) continue;
		seen.add(tag);
		if (inChunk(nb.i, nb.j) && nb.face === face) continue;
		const readers = chunksReading({ ...nb, layer: 0 }, DEPTH, CHUNK_LEVEL);
		if (!readers.includes(key)) gap.push(nb);
	}
}
console.log(
	`chunk ${key}: ${drawn.length} apron cells drawn, ${gap.length} cells their ring reads that no edit reaches`,
);

// Dig a shaft in one of them, on land.
const store = new DeltaStore({
	version: STORE_VERSION,
	subdivisionDepth: DEPTH,
	chunkLevel: CHUNK_LEVEL,
	registry: ["chamfer:air", "chamfer:stone"],
});
let victim: { face: number; i: number; j: number } | null = null;
const pool = process.env.PCTRL ? drawn : gap;
for (const c of pool) {
	const column = terrain.columnAt(c.face, c.i, c.j);
	if (column.groundRadius <= shape.seaLevelRadius + 30) continue;
	victim = c;
	break;
}
if (!victim) throw new Error("no land in the gap");
const column = terrain.columnAt(victim.face, victim.i, victim.j);
const top = shape.layerOfSurface(column.groundRadius);
const MODE = process.env.PMODE ?? "tower";
if (MODE === "tower")
	for (let layer = top - 10; layer < top; layer++)
		store.write({ ...victim, layer }, packBlockState(BlockType.STONE, 0));
else
	for (let layer = top; layer < top + 40; layer++)
		store.write({ ...victim, layer }, packBlockState(BlockType.AIR, 0));
console.log(
	`${MODE} at ${id(victim.face, victim.i, victim.j)} around layer ${top}`,
);
console.log(`  chunks the store tells: ${store.write({ ...victim, layer: top }, packBlockState(BlockType.AIR, 0)).join(", ")}`);
console.log(`  rows handed to chunk ${key}: ${store.rowsFor(key).length}`);

function build(rows: { chunkKey: number; deltas: ReturnType<DeltaStore["rowOf"]> }[]) {
	const chunk = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
	const outside = applyDeltas(
		chunk,
		rows.map((r) => ({ chunkKey: r.chunkKey, deltas: r.deltas! })),
		DEPTH,
		0,
	);
	const opaque = new ArrayMeshSink(4096);
	const translucent = new ArrayMeshSink(256);
	const tally = meshChunk(
		chunk,
		new ChunkColumnSampler(chunk, terrain, outside),
		shape,
		map.seed,
		new Vec3(0, 0, 0),
		opaque,
		translucent,
		{ apron: true, surfaceGrid: shape.blockSize },
	);
	const sampler2 = new ChunkColumnSampler(chunk, terrain, outside);
	const vcol = sampler2.columnAt(victim!.face, victim!.i, victim!.j);
	console.log(`    victim column first=${vcol.first} last=${vcol.last} outsideEntries=${outside.size}`);
	return { geometry: opaque.build(tally.cells), tally };
}

const production = build(store.rowsFor(key));
const everything = build(
	[...store.entries()].map(([k, deltas]) => ({ chunkKey: k, deltas })),
);

const a = production.geometry.vertices;
const b = everything.geometry.vertices;
console.log(
	`\nvertices: production ${a.length / 6}, all-rows ${b.length / 6}; ` +
		`triangles ${production.geometry.indices.length / 3} vs ${everything.geometry.indices.length / 3}`,
);
if (a.length === b.length) {
	let posDiff = 0;
	let colDiff = 0;
	let worst = 0;
	for (let v = 0; v * 6 < a.length; v++) {
		const o = v * 6;
		for (let c = 0; c < 3; c++) if (a[o + c] !== b[o + c]) posDiff++;
		for (let c = 3; c < 6; c++)
			if (a[o + c] !== b[o + c]) {
				colDiff++;
				worst = Math.max(worst, Math.abs(a[o + c]! - b[o + c]!) / (b[o + c]! || 1));
			}
	}
	console.log(
		`  differing position components: ${posDiff}; differing color components: ${colDiff}; worst relative color error ${(worst * 100).toFixed(1)}%`,
	);
}
