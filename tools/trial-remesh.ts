// What the terrain path spends that the mesh path skips.
//
//   npx tsx tools/trial-remesh.ts
//
// A knob in `BAKED_KNOBS` -- speckle, corner shading, sky exposure, full light
// -- changes a number the mesher multiplies into a vertex colour. It moves no
// block: the terrain reads a face and a lattice offset and has never been told
// about one of them. So the map, the shape, the peak pyramid and the per-level
// generators all still describe this world, and the only thing wrong is every
// chunk that is drawn.
//
// `flushTerrain` rebuilt all of them anyway, because it is the path a terrain
// knob takes and the baked knobs were routed down it. This is the bill that
// took, split by the step that spends it.
//
// Wall-clock, and it moves run to run. Read the split.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	ChunkPeaks,
	TerrainGenerator,
	buildCoarseMap,
	seedFromString,
} from "chamfer/generation";

const settings = new PlanetSettings({ plain: false });
const seed = seedFromString(settings.knobs.seed);
const CHUNK_LEVEL = settings.chunkLevel;

let at = performance.now();
const map = buildCoarseMap(seed, settings.coarseOptions());
const mapMs = performance.now() - at;

at = performance.now();
const shape = settings.shapeFor(map);
const shapeMs = performance.now() - at;

at = performance.now();
const peaks = new ChunkPeaks(map, settings.knobs.blockSize, CHUNK_LEVEL);
const peaksMs = performance.now() - at;

at = performance.now();
const byLod = [];
for (let lod = 0; lod <= CHUNK_LEVEL; lod++)
	byLod.push(
		new TerrainGenerator(
			seed,
			shape.atLod(lod),
			map,
			settings.terrainOptions(),
		),
	);
const genMs = performance.now() - at;

const total = mapMs + shapeMs + peaksMs + genMs;
const line = (what: string, ms: number) =>
	`${what.padEnd(24)} ${Math.round(ms).toString().padStart(5)} ms`;

console.log(`the shipped world, depth ${settings.depth}, chunks at level ${CHUNK_LEVEL}`);
console.log(line("coarse map", mapMs));
console.log(line("shape", shapeMs));
console.log(line("peak pyramid", peaksMs));
console.log(line(`${byLod.length} generators`, genMs));
console.log(line("skipped by the mesh path", total));
console.log(
	`the map alone is ${Math.round((mapMs / total) * 100)}% of it, and not one` +
		` input to any of these\nis a function of a baked knob`,
);
void peaks;
