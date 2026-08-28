// What a chunk of ground costs, term by term.
//
//   npx vite-node tools/trial-chunk-terms.ts [chunks]
//
// A column is written from the crust top down to wherever the last term can
// still open a layer, and filled solid below that. Three things can open one --
// the soil, the carve that cuts cliffs and overhangs, and the caves -- and each
// states its own reach, so each sets how many layers are evaluated rather than
// filled. This turns each off in turn and reports what a chunk costs without
// it, over land chunks drawn at random.
//
// Wall-clock on a software machine; read the shares.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	BlockType,
	ChunkAddress,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import { canonicalCell, directionToCell, splitPath } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

const WANT = Number(process.argv[2] ?? 8);
const PASSES = 3;

const settings = new PlanetSettings({ plain: false });
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const chunkLevel = settings.chunkLevel;
const n = shape.n;
const options = settings.terrainOptions();

/** The same world with one term switched off. */
const ways: { name: string; how: typeof options }[] = [
	{ name: "everything on", how: options },
	{ name: "no caves", how: { ...options, caves: false } },
	{ name: "no cliffs", how: { ...options, carveLayer: false } },
	{
		name: "neither",
		how: { ...options, caves: false, carveLayer: false },
	},
];
const made = ways.map((way) => ({
	...way,
	terrain: new TerrainGenerator(seed, shape, map, way.how),
}));

let state = 20260828;
const next = (): number => {
	state = (state * 1103515245 + 12345) & 0x7fffffff;
	return state / 0x7fffffff;
};

/** A chunk with land over nearly all of it, which is where the terms bite. */
function landChunk(): ChunkAddress | null {
	const y = 2 * next() - 1;
	const ring = Math.sqrt(Math.max(0, 1 - y * y));
	const turn = 2 * Math.PI * next();
	const dir = new Vec3(
		Math.cos(turn) * ring,
		y,
		Math.sin(turn) * ring,
	).normalize();
	const found = directionToCell(dir, n);
	const cell = canonicalCell(found.face, n, found.i, found.j);
	const split = splitPath(cell.i, cell.j, settings.depth, chunkLevel);
	const one = new ChunkAddress(cell.face, split.path);
	const chunk = generateChunk(
		made[0]!.terrain,
		one,
		chunkLevel,
		shape.crustDepth,
	);
	let above = 0;
	for (let slot = 0; slot < chunk.slots; slot++)
		if (chunk.surface[slot * 2]! > shape.seaLevelRadius) above++;
	return above >= chunk.slots * 0.95 ? one : null;
}

// Warm up.
{
	const one = landChunk() ?? new ChunkAddress(0, [0, 0, 0, 0, 0, 0, 0]);
	for (const way of made)
		generateChunk(way.terrain, one, chunkLevel, shape.crustDepth);
	state = 20260828;
}

const total = new Float64Array(made.length);
const air = new Float64Array(made.length);
let found = 0;
for (let tries = 0; tries < 4000 && found < WANT; tries++) {
	const address = landChunk();
	if (!address) continue;
	found++;
	for (let w = 0; w < made.length; w++) {
		let least = Infinity;
		let holes = 0;
		for (let p = 0; p < PASSES; p++) {
			const at = performance.now();
			const chunk = generateChunk(
				made[w]!.terrain,
				address,
				chunkLevel,
				shape.crustDepth,
			);
			least = Math.min(least, performance.now() - at);
			if (p === 0) {
				// Air under the topmost block of a column is a hole: what the
				// carve and the caves leave, and what forbids assuming a
				// column is solid from its surface down.
				for (let slot = 0; slot < chunk.slots; slot++) {
					const base = slot * chunk.layerCount;
					let top = -1;
					for (let l = 0; l < chunk.layerCount; l++)
						if (chunk.blocks[base + l] !== BlockType.AIR) {
							top = l;
							break;
						}
					if (top < 0) continue;
					for (let l = top; l < chunk.layerCount; l++)
						if (chunk.blocks[base + l] === BlockType.AIR) holes++;
				}
			}
		}
		total[w] += least;
		air[w] += holes;
	}
}

const line = (what: string, ms: number, holes: number): void =>
	console.log(
		what.padEnd(16) +
			`${(ms / found).toFixed(1)} ms`.padStart(11) +
			`${((100 * ms) / total[0]!).toFixed(0)}%`.padStart(7) +
			`${(holes / found).toFixed(0)}`.padStart(12),
	);

console.log(
	`depth ${settings.depth}, block ${settings.knobs.blockSize} m, ` +
		`${settings.chunkSpan.toFixed(0)} m chunks, crust ${shape.crustDepth} layers`,
);
console.log(`${found} land chunks, best of ${PASSES}\n`);
console.log(
	"world".padEnd(16) +
		"a chunk".padStart(11) +
		"of full".padStart(7) +
		"holes".padStart(12),
);
for (let w = 0; w < made.length; w++)
	line(made[w]!.name, total[w]!, air[w]!);
console.log(
	`\nholes: cells with air under the topmost block of their own column, ` +
		`out of ${(2145 * shape.crustDepth).toLocaleString("en-US")} a chunk`,
);
