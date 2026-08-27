// What a chunk's probe volume costs to build and to carry.
//
//   npx tsx tools/trial-probes.ts
//
// The case for probes is that they cost a fraction of the cells they stand
// among. This is that fraction, on the shipped world, against the mesh they
// travel beside. Wall-clock figures move run to run; read the ratios.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	ChunkAddress,
	TerrainGenerator,
	buildCoarseMap,
	ChunkColumnSampler,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import { buildChunkMesh } from "chamfer/mesh";
import { probeVolume } from "chamfer/light";

const settings = new PlanetSettings({ plain: false });
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const terrain = new TerrainGenerator(seed, shape, map, settings.terrainOptions());
const CHUNK_LEVEL = settings.chunkLevel;

// A chunk somewhere on land, generated the way a worker would.
const address = ChunkAddress.fromKey(3 * 4 ** CHUNK_LEVEL + 17, CHUNK_LEVEL);
let at = performance.now();
const chunk = generateChunk(terrain, address, CHUNK_LEVEL, shape.crustDepth);
const genMs = performance.now() - at;

// The band the mesher works in, which is all a probe volume has to cover.
let first = chunk.layerCount;
let last = 0;
for (let slot = 0; slot < chunk.slots; slot++) {
	const top = chunk.band[slot * 2]!;
	const bottom = chunk.band[slot * 2 + 1]!;
	if (top >= 0 && top < first) first = top;
	if (bottom > last) last = bottom;
}
const band = Math.max(1, last - first + 1);

const cells = chunk.slots * chunk.layerCount;
console.log(`depth ${settings.depth}, chunk level ${CHUNK_LEVEL}, side ${chunk.m}`);
console.log(`generate one chunk      ${genMs.toFixed(1)} ms`);
console.log(`cells in the chunk      ${cells.toLocaleString()} (${((cells * 2) / 1024 / 1024).toFixed(1)} MB of blocks)`);
console.log(`layers the band spans   ${band} of ${chunk.layerCount}`);
console.log("");
// What the chunk's own mesh costs, which is what the volume rides beside.
const mesh = buildChunkMesh(
	chunk,
	new ChunkColumnSampler(chunk, terrain),
	shape,
	seed,
	{ apron: true, surfaceGrid: shape.blockSize },
);
const meshBytes =
	mesh.opaque.vertices.byteLength +
	mesh.opaque.indices.byteLength +
	mesh.translucent.vertices.byteLength +
	mesh.translucent.indices.byteLength;
console.log(`mesh on the GPU         ${(meshBytes / 1024).toFixed(1)} KB` +
	` (${mesh.opaque.vertices.length / 6} vertices)`);
console.log("");
console.log(`${"spacing".padEnd(9)}${"probes".padStart(10)}${"KB".padStart(8)}${"of blocks".padStart(11)}${"build".padStart(10)}${"of mesh".padStart(10)}${"transient".padStart(11)}`);
for (const spacing of [2, 4, 8, 16]) {
	// Three runs, best of, because a first pass pays for the arrays.
	let best = Infinity;
	let volume;
	for (let run = 0; run < 3; run++) {
		const started = performance.now();
		volume = probeVolume(chunk, spacing, first, last);
		best = Math.min(best, performance.now() - started);
	}
	const probes = volume!.across * volume!.across * volume!.down;
	console.log(
		`${String(spacing).padEnd(9)}${probes.toLocaleString().padStart(10)}` +
			`${(volume!.data.length / 1024).toFixed(1).padStart(8)}` +
			`${((volume!.data.length / (cells * 2)) * 100).toFixed(2).padStart(10)}%` +
			`${best.toFixed(1).padStart(9)} ms` +
			`${((volume!.data.length / meshBytes) * 100).toFixed(1).padStart(9)}%` +
			// Two float fields and a flag while the light is being passed
			// around, thrown away as soon as the bytes are packed.
			`${((probes * 13) / 1024).toFixed(0).padStart(8)} KB`,
	);
}
