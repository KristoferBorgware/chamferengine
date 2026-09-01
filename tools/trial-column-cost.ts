/**
 * What a column actually costs to generate, and what sets it.
 *
 * `fillColumn` walks a column from layer 0 downward. Layer 0 sits above the
 * planet's tallest ground, so a column whose own ground is low is walked
 * through every layer of air standing over it before anything is decided --
 * and how much air that is, is `maxElevation`, the crust top's height over
 * sea level. If that is the cost, then a sea-floor column is dearer than a
 * mountain column in the same world, and the ceiling a world allows for its
 * mountains prices every column that is nowhere near it.
 */
import {
	CARVE_LAYER_DEFAULT,
	COARSE_MAP_DEFAULTS,
	ChunkAddress,
	TerrainGenerator,
	buildCoarseMap,
	seedFromString,
} from "chamfer/generation";
import { joinPath, rank } from "chamfer/addressing";
import { CELL_CONSTANT, WorldShape } from "chamfer/world";

const DEPTH = 13;
const LEVEL = 8;
const BLOCK = 1;
const RUNS = 3;
const COLUMNS = 4000;

const map = buildCoarseMap(seedFromString("chamfer"), {
	level: LEVEL,
	cellMetres: 32,
});
let top = 0;
let floor = 0;
for (let c = 0; c < map.count; c++) {
	const h = map.height[c]!;
	if (h > top) top = h;
	if (h < floor) floor = h;
}
top = Math.ceil(top);
const layers = Math.ceil(top - floor) + 8;
const radius = (BLOCK * 2 ** DEPTH) / CELL_CONSTANT;
const shape = new WorldShape(radius, DEPTH, top, layers);

console.log(
	`depth ${DEPTH}, ${BLOCK} m block, crust ${layers} layers, ` +
		`crust top ${top} m over the sea\n`,
);

/** Columns sorted by their own elevation, so the two ends can be timed apart. */
const n = 1 << DEPTH;
const picks: { i: number; j: number; elevation: number }[] = [];
for (let s = 0; s < COLUMNS * 6; s++) {
	const i = (s * 7919) % n;
	const j = (s * 104729) % (n - i);
	picks.push({ i, j, elevation: map.heightAt(0, i, j, DEPTH) });
}
picks.sort((a, b) => a.elevation - b.elevation);

function timeOf(
	gen: TerrainGenerator,
	set: { i: number; j: number }[],
): number {
	const into = new Uint16Array(layers);
	let ms = 0;
	for (let run = 0; run < RUNS; run++) {
		const a = performance.now();
		for (const p of set) {
			const column = gen.columnAt(0, p.i, p.j);
			gen.fillColumn(column, into, 0, layers);
		}
		ms += performance.now() - a;
	}
	return (ms / (RUNS * set.length)) * 1000;
}

for (const carve of [true, false]) {
	const gen = new TerrainGenerator(map.seed, shape, map, {
		carveLayer: carve,
		carve: CARVE_LAYER_DEFAULT,
		caves: true,
	});
	const deep = picks.slice(0, COLUMNS);
	const high = picks.slice(-COLUMNS);
	const lowMean = deep.reduce((s, p) => s + p.elevation, 0) / COLUMNS;
	const highMean = high.reduce((s, p) => s + p.elevation, 0) / COLUMNS;
	console.log(`cliffs and overhangs ${carve ? "ON" : "OFF"}`);
	console.log(
		`  deepest ${COLUMNS} columns (mean ${lowMean.toFixed(0)} m): ` +
			`${timeOf(gen, deep).toFixed(2)} us a column`,
	);
	console.log(
		`  highest ${COLUMNS} columns (mean ${highMean.toFixed(0)} m): ` +
			`${timeOf(gen, high).toFixed(2)} us a column\n`,
	);
}
