// How dense a forest stays as the level of detail drops.
//
//   npx vite-node tools/trial-plant-density.ts
//
// **A root is a cell of the world's finest lattice whatever level a chunk is
// drawn at**, or a coarse chunk hashing its own cells would choose a different
// forest at every level and a tree would come and go as the player walked. A
// drawn cell at a coarse level covers `4^lod` of those roots, and what a column
// asks about them decides the density of the forest at that distance: its own
// point alone offers one root in `4^lod`, and the whole block offers all of
// them and grows the first that wants a plant, which is the physical cap of one
// trunk to a column.
//
// This counts the plants over one fixed triangle of ground, drawn at four
// levels, both ways. Wall-clock beside it moves run to run; read the counts.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	ChunkAddress,
	PlantTemplateStore,
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

/** The chunk holding the place the benches open at, which has land on it. */
const dir = positionOf(
	{
		latitude: settings.knobs.patchLatitude,
		longitude: settings.knobs.patchLongitude,
		altitude: 0,
	},
	1,
);
const found = directionToCell(dir, shape.n);
const cell = canonicalCell(found.face, shape.n, found.i, found.j);
const split = splitPath(cell.i, cell.j, settings.depth, chunkLevel);
const here = new ChunkAddress(cell.face, split.path).key;

/** One triangle of ground, five levels up from the finest chunk. */
const TOP = 5;
const root = Math.floor(here / 4 ** TOP);

function over(lod: number): { plants: number; cover: number; ms: number } {
	const level = shape.atLod(lod);
	const terrain = new TerrainGenerator(
		seed,
		level,
		map,
		settings.terrainOptions(),
	);
	const templates = new PlantTemplateStore(
		seed,
		level.subdivisionDepth,
		level.blockSize,
		level.seaLevelRadius,
	);
	const cut = chunkLevel - lod;
	const chunks = 4 ** (TOP - lod);
	let plants = 0;
	let shaded = 0;
	let columns = 0;
	const at = performance.now();
	for (let one = 0; one < chunks; one++) {
		const chunk = generateChunk(
			terrain,
			ChunkAddress.fromKey(root * chunks + one, cut),
			cut,
			level.crustDepth,
		);
		const grown = plantChunk(
			chunk,
			terrain,
			level,
			layers,
			seed,
			settings.depth,
			templates,
		);
		plants += grown?.plants ?? 0;
		// **How much of the ground is under a canopy**, which is what a
		// picture of a forest at a distance actually shows. A count of trees
		// is not it: a plant at a coarse level is drawn at that level's own
		// block, and one block is the smallest thing there is.
		columns += chunk.slots;
		const under = new Set<number>();
		for (const at2 of grown?.where ?? []) {
			under.add(Math.floor(at2 / chunk.layerCount));
		}
		// A column the grid was too coarse to build a plant on is under a
		// canopy all the same -- the plant is its ground's colour there.
		shaded += under.size + (grown?.cover.size ?? 0);
	}
	return {
		plants,
		cover: columns ? shaded / columns : 0,
		ms: performance.now() - at,
	};
}

console.log(
	`one triangle of ground ${(settings.chunkSpan * 2 ** TOP).toFixed(0)} m a ` +
		`side, at depth ${settings.depth}, block ${settings.knobs.blockSize} m`,
);
console.log(`${layers.length} layers: ${layers.map((l) => l.species).join(", ")}`);

const finest = over(0);
console.log(
	"\n" +
		"level".padEnd(8) +
		"chunks".padStart(8) +
		"block".padStart(9) +
		"plants".padStart(9) +
		"of finest".padStart(11) +
		"canopy".padStart(9) +
		"ms".padStart(9),
);
console.log(
	"lod 0".padEnd(8) +
		`${4 ** TOP}`.padStart(8) +
		`${shape.blockSize.toFixed(1)} m`.padStart(9) +
		`${finest.plants.toLocaleString("en-US")}`.padStart(9) +
		"100%".padStart(11) +
		`${(100 * finest.cover).toFixed(1)}%`.padStart(9) +
		`${finest.ms.toFixed(0)}`.padStart(9),
);
for (let lod = 1; lod <= TOP; lod++) {
	const got = over(lod);
	console.log(
		`lod ${lod}`.padEnd(8) +
			`${4 ** (TOP - lod)}`.padStart(8) +
			`${shape.atLod(lod).blockSize.toFixed(1)} m`.padStart(9) +
			`${got.plants.toLocaleString("en-US")}`.padStart(9) +
			`${((100 * got.plants) / finest.plants).toFixed(0)}%`.padStart(11) +
			`${(100 * got.cover).toFixed(1)}%`.padStart(9) +
			`${got.ms.toFixed(0)}`.padStart(9),
	);
}
