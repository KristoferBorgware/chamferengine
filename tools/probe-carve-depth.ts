/**
 * How much of the carve survives into a chunk's blocks.
 *
 * `blockAt` answers one block honestly. `fillColumn` is what a chunk build
 * actually calls, and it evaluates a band under the ground and fills the crust
 * below it with stone -- so a term that can open air deeper than that band is a
 * term whose work is written over. This walks the same columns through both and
 * counts what the two disagree about.
 */
import {
	CARVE_LAYER_DEFAULT,
	COARSE_MAP_DEFAULTS,
	TerrainGenerator,
	buildCoarseMap,
	carveDepth,
	maxElevationFor,
	seedFromString,
} from "chamfer/generation";
import { CELL_CONSTANT, WorldShape, maxCrustDepth } from "chamfer/world";

/** The shipped world: depth 13 at a 1 m block, on a 32 m map. */
const DEPTH = 13;
const LEVEL = 8;
const BLOCK = 1;

/** The band as it stood before the carve was counted into it. */
const SOIL_BAND = COARSE_MAP_DEFAULTS ? 4 : 4;

const map = buildCoarseMap(seedFromString("chamfer"), {
	level: LEVEL,
	cellMetres: 32,
});
const shape = new WorldShape(
	(BLOCK * 2 ** DEPTH) / CELL_CONSTANT,
	DEPTH,
	maxElevationFor({
		relief: COARSE_MAP_DEFAULTS.relief,
		peakRelief: COARSE_MAP_DEFAULTS.peakRelief,
	}),
	maxCrustDepth(DEPTH),
);
const gen = new TerrainGenerator(map.seed, shape, map, {
	carveLayer: true,
	carve: CARVE_LAYER_DEFAULT,
});

const layers = shape.crustDepth;
const into = new Uint16Array(layers);
let seen = 0;
let refilled = 0;
let extra = 0;
let stacked = 0;
let refilledBefore = 0;
let stackedBefore = 0;

/** How many separate runs of rock a column holds. */
const runsOf = (solidAt: (layer: number) => boolean): number => {
	let runs = 0;
	let rock = false;
	for (let layer = 0; layer < layers; layer++) {
		const solid = solidAt(layer);
		if (solid && !rock) runs++;
		rock = solid;
	}
	return runs;
};

for (let i = 0; i <= shape.n; i += 97)
	for (let j = 0; i + j <= shape.n; j += 97) {
		const column = gen.columnAt(3, i, j);
		if (column.elevation <= 0) continue;
		seen++;
		gen.fillColumn(column, into, 0, layers);
		for (let layer = column.groundLayer; layer < layers; layer++) {
			const honest = gen.blockAt(column, layer) !== 0;
			const written = into[layer] !== 0;
			if (honest === written) continue;
			if (written) refilled++;
			else extra++;
		}
		if (runsOf((l) => into[l] !== 0) > 1) stacked++;

		// The same column with the band at the soil alone, which is what it was.
		const wasBand = Math.min(layers, column.groundLayer + SOIL_BAND);
		if (runsOf((l) => l >= wasBand || gen.blockAt(column, l) !== 0) > 1)
			stackedBefore++;
		for (let layer = wasBand; layer < layers; layer++)
			if (gen.blockAt(column, layer) === 0) refilledBefore++;
	}

console.log(
	`depth ${DEPTH}, map level ${LEVEL}, ${seen} land columns of one face`,
);
console.log(
	`the carve reaches ${carveDepth(CARVE_LAYER_DEFAULT).toFixed(0)} m, ` +
		`which is ${Math.ceil(carveDepth(CARVE_LAYER_DEFAULT) / shape.blockSize)} ` +
		`layers of a ${layers}-layer crust`,
);
console.log("");
console.log(`band at the soil alone -- ${SOIL_BAND} layers under the ground:`);
console.log(`  ${refilledBefore.toLocaleString()} carved blocks written back to stone`);
console.log(`  ${stackedBefore} columns left holding rock over air`);
console.log("");
console.log("band at the carve's own reach:");
console.log(`  ${refilled.toLocaleString()} carved blocks written back to stone`);
console.log(`  ${extra.toLocaleString()} blocks solid in one and air in the other`);
console.log(`  ${stacked} columns holding rock over air`);
