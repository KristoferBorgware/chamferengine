// Seed-vs-patched probe 3: which columns a chunk SAMPLES that no edit is ever
// routed to. chunksReading defines a reader as "holds the cell or one of its
// six neighbours" -- one step. meshApronCell resolves the ring of a cell that
// is ALREADY one step out.
import {
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import { chunksReading } from "chamfer/edit";
import { meshChunk } from "chamfer/mesh";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { Vec3 } from "chamfer/math";
import { joinPath, latticePosition } from "chamfer/addressing";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const seed = seedFromString("chamfer");
const map = buildCoarseMap(seed, { level: 6, cellMetres: 100, relief: 300 });
const shape = new WorldShape(1700, DEPTH, 300, maxCrustDepth(DEPTH));
const terrain = new TerrainGenerator(seed, shape, map);
const n = 1 << DEPTH;

let totalSampled = 0;
let totalUnreachable = 0;
let chunks = 0;
const examples: string[] = [];

for (let key = 0; key < 60; key++) {
	const address = ChunkAddress.fromKey(key, CHUNK_LEVEL);
	const chunk = generateChunk(terrain, address, CHUNK_LEVEL, shape.crustDepth);
	const base = new ChunkColumnSampler(chunk, terrain, null);
	const asked: { face: number; i: number; j: number }[] = [];
	const sampler = {
		columnAt(face: number, i: number, j: number) {
			asked.push({ face, i, j });
			return base.columnAt(face, i, j);
		},
	};
	const [oi, oj] = joinPath(address.path, 0, 0, DEPTH);
	const origin = latticePosition(address.face, n, oi, oj).scale(
		shape.seaLevelRadius,
	);
	const sink = { vertex: () => 0, triangle: () => {} };
	meshChunk(chunk, sampler, shape, seed, new Vec3(origin.x, origin.y, origin.z), sink, sink, {
		apron: true,
		surfaceGrid: shape.blockSize,
		speckle: 0,
	});

	const seen = new Map<string, { face: number; i: number; j: number }>();
	for (const c of asked) seen.set(`${c.face}:${c.i}:${c.j}`, c);
	let missed = 0;
	for (const [label, c] of seen) {
		const readers = chunksReading(
			{ ...c, layer: 0 },
			DEPTH,
			CHUNK_LEVEL,
		);
		if (!readers.includes(key)) {
			missed++;
			if (examples.length < 5 && key === 0)
				examples.push(`chunk ${key} samples ${label}; readers ${readers.join(",")}`);
		}
	}
	totalSampled += seen.size;
	totalUnreachable += missed;
	chunks++;
}

console.log(`depth ${DEPTH}, chunk level ${CHUNK_LEVEL}, ${chunks} chunks`);
console.log(
	`distinct columns sampled per chunk : ${(totalSampled / chunks).toFixed(1)}`,
);
console.log(
	`of those, NO edit is ever routed to: ${(totalUnreachable / chunks).toFixed(1)} (${((100 * totalUnreachable) / totalSampled).toFixed(1)}%)`,
);
for (const e of examples) console.log("  " + e);
