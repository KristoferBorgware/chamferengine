/**
 * Every column a chunk's mesher actually asks for, against the set the store
 * routes an edit to.
 *
 * The store and the mesher have to agree about how far past its own triangle a
 * chunk reads. The mesher is the authority: this wraps the real
 * `ChunkColumnSampler`, meshes real chunks, records every distinct cell asked
 * for, and asks `chunksReading` whether an edit to that cell would ever be
 * routed here. Anything it would not is a column that answers from the seed
 * forever, however far anybody digs.
 *
 *   npx vite-node tools/probe-mesher-reach.ts
 */
import {
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import { chunksReading } from "chamfer/edit";
import { buildChunkMesh } from "chamfer/mesh";
import { WorldShape } from "chamfer/world";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const LAYERS = 48;
const SEED = seedFromString("reach");

const map = buildCoarseMap(SEED, { level: 6, cellMetres: 100, relief: 100 });
const shape = new WorldShape(1700, DEPTH, 150, LAYERS);
const terrain = new TerrainGenerator(SEED, shape, map);

let sampled = 0;
let unrouted = 0;
let chunks = 0;
const missedExamples: string[] = [];

for (let key = 0; key < 60; key++) {
	const address = ChunkAddress.fromKey(key, CHUNK_LEVEL);
	const chunk = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
	const real = new ChunkColumnSampler(chunk, terrain);
	const asked = new Set<string>();
	const spy = {
		columnAt(face: number, i: number, j: number) {
			asked.add(`${face}:${i}:${j}`);
			return real.columnAt(face, i, j);
		},
	};
	buildChunkMesh(chunk, spy, shape, SEED, { apron: true });
	chunks++;
	for (const name of asked) {
		const [face, i, j] = name.split(":").map(Number) as [
			number,
			number,
			number,
		];
		sampled++;
		const readers = chunksReading(
			{ face, i, j, layer: 0 },
			DEPTH,
			CHUNK_LEVEL,
		);
		if (!readers.includes(key)) {
			unrouted++;
			if (missedExamples.length < 4)
				missedExamples.push(`chunk ${key} reads ${name}`);
		}
	}
}

console.log(
	`over ${chunks} chunks at depth ${DEPTH} cut at chunk level ${CHUNK_LEVEL}:`,
);
console.log(
	`   ${(sampled / chunks).toFixed(1)} distinct columns sampled per chunk,`,
);
console.log(
	`   ${(unrouted / chunks).toFixed(1)} per chunk (${((100 * unrouted) / sampled).toFixed(1)}%) ` +
		`are cells no edit is ever routed to.`,
);
for (const line of missedExamples) console.log(`   ${line}`);
