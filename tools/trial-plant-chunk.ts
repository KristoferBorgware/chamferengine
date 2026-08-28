// What growing a chunk's plants costs, against generating its ground.
//
//   npx tsx tools/trial-plant-chunk.ts
//
// **A plant is grown from the address and the seed, into the chunk's own
// blocks.** A chunk grows every plant within reach of its rim, which is more
// ground than it owns, and the roots are chosen at the finest lattice whatever
// level the chunk is drawn at -- so the walk does not get cheaper with
// distance the way the terrain does. This is what both come to.
//
// Wall-clock, and it moves run to run. Read the ratio.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	ChunkAddress,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	plantChunk,
	seedFromString,
} from "chamfer/generation";
import { canonicalCell, directionToCell, splitPath } from "chamfer/addressing";
import { positionOf } from "chamfer/coordinates";
import { plantLayerOf } from "../packages/client/src/PlantDraft.js";

const settings = new PlanetSettings({ plain: false });
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const layers = settings.plantLayers.map(plantLayerOf);
const chunkLevel = settings.chunkLevel;

/** The chunk holding the place the benches open at. */
function chunkUnder(): ChunkAddress {
	const dir = positionOf(
		{
			latitude: settings.knobs.patchLatitude,
			longitude: settings.knobs.patchLongitude,
			altitude: 0,
		},
		1,
	);
	const n = 2 ** settings.depth;
	const found = directionToCell(dir, n);
	const cell = canonicalCell(found.face, n, found.i, found.j);
	const split = splitPath(cell.i, cell.j, settings.depth, chunkLevel);
	return new ChunkAddress(cell.face, split.path);
}

const line = (what: string, ms: number, extra = ""): void => {
	console.log(
		`${what.padEnd(30)} ${ms.toFixed(1).padStart(8)} ms  ${extra}`,
	);
};

console.log(
	`depth ${settings.depth}, block ${settings.knobs.blockSize} m, chunks at ` +
		`level ${chunkLevel} — ${settings.chunkSpan.toFixed(0)} m across`,
);
console.log(`${layers.length} layers: ${layers.map((l) => l.species).join(", ")}`);

for (const lod of [0, 2, 4]) {
	const level = shape.atLod(lod);
	const terrain = new TerrainGenerator(
		seed,
		level,
		map,
		settings.terrainOptions(),
	);
	// The chunk under the bench's own patch, which is a place with land on it.
	const address = chunkUnder();

	let at = performance.now();
	const chunk = generateChunk(terrain, address, chunkLevel, level.crustDepth);
	const groundMs = performance.now() - at;

	at = performance.now();
	const grown = plantChunk(
		chunk,
		terrain,
		level,
		layers,
		seed,
		settings.depth,
	);
	const plantMs = performance.now() - at;

	console.log(`\nlod ${lod} — ${chunk.slots.toLocaleString("en-US")} slots`);
	line("the ground", groundMs);
	line(
		"the plants",
		plantMs,
		grown
			? `${grown.plants} plants, ${grown.wood.toLocaleString("en-US")} wood + ${grown.leaf.toLocaleString("en-US")} leaf`
			: "no layers on",
	);
	line("plants against ground", plantMs, `x${(plantMs / groundMs).toFixed(1)}`);
}
