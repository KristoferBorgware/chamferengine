// What the mesher costs, so a change to its inner loop can be priced.
//
//   npx vite-node tools/trial-mesh-cost.ts
//
// The demand path for block pictures added a check per drawn cell -- is this
// type one already seen -- and a flag array cleared per chunk. Both sit in
// `wearing`, which is called for every cell a chunk draws, so the question is
// whether they show against the work already there.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import { plantLayerOf } from "../packages/client/src/PlantDraft.js";
import { biomeFieldFor } from "../packages/client/src/biomeFieldFor.js";
import {
	ChunkAddress,
	ChunkColumnSampler,
	PlantTemplateStore,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	plantChunk,
	seedFromString,
} from "chamfer/generation";
import { canonicalCell, directionToCell, splitPath } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";
import { buildChunkMesh } from "chamfer/mesh";

const settings = new PlanetSettings({ plain: false });
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const field = biomeFieldFor(seed, shape, map, settings);
const layers = settings.plantLayers.map(plantLayerOf);
const terrain = new TerrainGenerator(seed, shape, map, settings.terrainOptions());
const templates = new PlantTemplateStore(
	seed,
	shape.subdivisionDepth,
	shape.blockSize,
	shape.seaLevelRadius,
);

const chunks: ReturnType<typeof generateChunk>[] = [];
let pick = 987654321;
for (let tries = 0; tries < 4000 && chunks.length < 8; tries++) {
	pick = (Math.imul(pick, 1664525) + 1013904223) >>> 0;
	const z = (pick / 2 ** 32) * 2 - 1;
	pick = (Math.imul(pick, 1664525) + 1013904223) >>> 0;
	const phi = (pick / 2 ** 32) * Math.PI * 2;
	const r = Math.sqrt(1 - z * z);
	const dir = new Vec3(r * Math.cos(phi), r * Math.sin(phi), z);
	const cell = directionToCell(dir, shape.n);
	const home = canonicalCell(cell.face, shape.n, cell.i, cell.j);
	if (terrain.columnAt(home.face, home.i, home.j).elevation <= 5) continue;
	const split = splitPath(home.i, home.j, settings.depth, settings.chunkLevel);
	const chunk = generateChunk(
		terrain,
		new ChunkAddress(home.face, split.path),
		settings.chunkLevel,
		shape.crustDepth,
	);
	plantChunk(chunk, terrain, shape, layers, seed, settings.depth, templates, field);
	chunks.push(chunk);
}

const mesh = () => {
	let cells = 0;
	for (const chunk of chunks) {
		const built = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, terrain),
			shape,
			seed,
			{ apron: true, cutoutLeaves: true },
		);
		cells += built.tally.cells;
	}
	return cells;
};

for (let warm = 0; warm < 3; warm++) mesh();
const runs: number[] = [];
let cells = 0;
for (let run = 0; run < 12; run++) {
	const at = performance.now();
	cells = mesh();
	runs.push(performance.now() - at);
}
runs.sort((a, b) => a - b);
const median = runs[Math.floor(runs.length / 2)]!;
console.log(`${chunks.length} forested chunks, ${cells.toLocaleString("en-US")} cells drawn`);
console.log(`  median ${median.toFixed(2)} ms, best ${runs[0]!.toFixed(2)}, worst ${runs.at(-1)!.toFixed(2)}`);
console.log(`  ${((median * 1e6) / cells).toFixed(1)} ns a drawn cell`);
