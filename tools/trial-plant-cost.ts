// What the trees add to building one chunk, at the finest level.
//
//   npx vite-node tools/trial-plant-cost.ts [chunks]
//
// A chunk in a worker is generated, planted and meshed, and the plants cost
// twice: once to grow and again in the mesh, because a tree is blocks and
// blocks are faces. So the comparison is the whole job with the plant pass
// against the whole job without it, on the same chunk.
//
// **Land only.** Nothing is planted at or below sea level, so a chunk of ocean
// answers a question nobody asked -- the chunks here are drawn at random over
// the sphere and kept only when nearly all of their columns stand above the
// water.
//
// Wall-clock on a software machine, and it moves run to run: the best of three
// passes per phase, and the percentage is what to read.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	buildCoarseMap,
	PlantTemplateStore,
	generateChunk,
	plantChunk,
	seedFromString,
} from "chamfer/generation";
import { canonicalCell, directionToCell, splitPath } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";
import { buildChunkMesh } from "chamfer/mesh";
import { plantLayerOf } from "../packages/client/src/PlantDraft.js";

const WANT = Number(process.argv[2] ?? 8);
/** How much of a chunk has to stand above the water to be worth timing. */
const LAND_SHARE = 0.95;
const PASSES = 3;

const settings = new PlanetSettings({ plain: false });
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const terrain = new TerrainGenerator(seed, shape, map, settings.terrainOptions());
const layers = settings.plantLayers.map(plantLayerOf);
const chunkLevel = settings.chunkLevel;
const n = 2 ** settings.depth;

// **Built once, like the coarse map.** Every worker makes its own from the
// seed and the species, so this stands in for one worker's whole life.
const templates = new PlantTemplateStore(
	seed,
	settings.depth,
	settings.knobs.blockSize,
	shape.seaLevelRadius,
);

const meshOptions = {
	apron: settings.knobs.apron,
	surfaceGrid: shape.blockSize,
	debugSeams: false,
	speckle: settings.knobs.speckle ? undefined : 0,
	ambientOcclusion: settings.knobs.ambientOcclusion,
	skyExposure: settings.knobs.skyExposure && !settings.knobs.fullbright,
};

/** A repeatable stream, so two runs of this trial visit the same chunks. */
let state = 20260828;
const next = (): number => {
	state = (state * 1103515245 + 12345) & 0x7fffffff;
	return state / 0x7fffffff;
};

/** A chunk address drawn at random over the whole sphere. */
function anyChunk(): ChunkAddress {
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
	return new ChunkAddress(cell.face, split.path);
}

/** The share of a chunk's columns whose ground stands above the water. */
function landShare(chunk: ReturnType<typeof generateChunk>): number {
	let land = 0;
	for (let slot = 0; slot < chunk.slots; slot++)
		if (chunk.surface[slot * 2]! > shape.seaLevelRadius) land++;
	return land / chunk.slots;
}

const build = (address: ChunkAddress) =>
	generateChunk(terrain, address, chunkLevel, shape.crustDepth);
const mesh = (chunk: ReturnType<typeof generateChunk>) =>
	buildChunkMesh(
		chunk,
		new ChunkColumnSampler(chunk, terrain, null),
		shape,
		seed,
		meshOptions,
	);

/** The best of {@link PASSES} runs, which is the least noise this machine has. */
function best(run: () => void): number {
	let least = Infinity;
	for (let p = 0; p < PASSES; p++) {
		const at = performance.now();
		run();
		least = Math.min(least, performance.now() - at);
	}
	return least;
}

// Warm up: the first chunk through pays for every function being compiled,
// and the first plant of each species pays for the whole template set.
{
	const warm = build(anyChunk());
	const at = performance.now();
	for (const layer of layers) if (layer.on) templates.forLayer(layer);
	const built = performance.now() - at;
	plantChunk(warm, terrain, shape, layers, seed, settings.depth, templates);
	mesh(warm);
	state = 20260828;
	console.log(
		`templates: ${built.toFixed(0)} ms once for every species, ` +
			`against every plant of every chunk forever`,
	);
}

console.log(
	`depth ${settings.depth}, block ${settings.knobs.blockSize} m, chunks at ` +
		`level ${chunkLevel} — ${settings.chunkSpan.toFixed(0)} m across, ` +
		`${settings.plantLayers.length} layers`,
);
console.log(
	"\n" +
		"chunk".padEnd(7) +
		"land".padStart(6) +
		"ground".padStart(9) +
		"mesh".padStart(9) +
		"plants".padStart(9) +
		"mesh+".padStart(9) +
		"without".padStart(10) +
		"with".padStart(9) +
		"more".padStart(8) +
		"  plants",
);

let sumWithout = 0;
let sumWith = 0;
let sumPlants = 0;
let sumGround = 0;
let found = 0;
const each: number[] = [];
let bare = 0;
let bareShare = 0;
let bareCount = 0;
for (let tries = 0; tries < 4000 && found < WANT; tries++) {
	const address = anyChunk();
	const probe = build(address);
	if (landShare(probe) < LAND_SHARE) continue;
	found++;

	// **The two are timed inside one pass**, never as two separate minima with
	// a subtraction between them: a chunk has to be clean before it is planted,
	// so the generate has to run anyway, and taking the best of each
	// independently would mix a fast generate with a slow plant.
	let groundMs = Infinity;
	let grow = Infinity;
	let plants = 0;
	let wood = 0;
	let leaf = 0;
	for (let p = 0; p < PASSES; p++) {
		let at = performance.now();
		const one = build(address);
		groundMs = Math.min(groundMs, performance.now() - at);
		at = performance.now();
		const got = plantChunk(
			one,
			terrain,
			shape,
			layers,
			seed,
			settings.depth,
			templates,
		);
		grow = Math.min(grow, performance.now() - at);
		plants = got?.plants ?? 0;
		wood = got?.wood ?? 0;
		leaf = got?.leaf ?? 0;
	}
	const plain = build(address);
	const plainMs = best(() => void mesh(plain));
	const plainFaces = mesh(plain).tally.faces;

	const grown = build(address);
	plantChunk(grown, terrain, shape, layers, seed, settings.depth, templates);
	const grownMs = best(() => void mesh(grown));
	const grownFaces = mesh(grown).tally.faces;

	const without = groundMs + plainMs;
	const withThem = groundMs + grow + grownMs;
	sumWithout += without;
	sumWith += withThem;
	sumPlants += grow;
	sumGround += groundMs;

	console.log(
		`${found}`.padEnd(7) +
			`${(landShare(probe) * 100).toFixed(0)}%`.padStart(6) +
			`${groundMs.toFixed(1)}`.padStart(9) +
			`${plainMs.toFixed(1)}`.padStart(9) +
			`${grow.toFixed(1)}`.padStart(9) +
			`${grownMs.toFixed(1)}`.padStart(9) +
			`${without.toFixed(1)}`.padStart(10) +
			`${withThem.toFixed(1)}`.padStart(9) +
			`+${(((withThem - without) / without) * 100).toFixed(0)}%`.padStart(8) +
			`  ${plants} plants, ${(wood + leaf).toLocaleString("en-US")} cells, ` +
			`${(((grownFaces - plainFaces) / plainFaces) * 100).toFixed(0)}% more faces`,
	);
	each.push(((withThem - without) / without) * 100);
	if (plants === 0) {
		bare += grow;
		bareShare += ((withThem - without) / without) * 100;
		bareCount++;
	}
}

bare /= Math.max(1, bareCount);
bareShare /= Math.max(1, bareCount);
each.sort((a, b) => a - b);
const median =
	each.length === 0
		? 0
		: each.length % 2 === 1
			? each[(each.length - 1) / 2]!
			: (each[each.length / 2 - 1]! + each[each.length / 2]!) / 2;
console.log(
	`\nover ${found} land chunks: ${sumWithout.toFixed(0)} ms without the trees, ` +
		`${sumWith.toFixed(0)} ms with — ` +
		`**+${(((sumWith - sumWithout) / sumWithout) * 100).toFixed(0)}%**`,
);
console.log(
	`the middle chunk is +${median.toFixed(0)}%, the range ` +
		`+${each[0]!.toFixed(0)}% to +${each[each.length - 1]!.toFixed(0)}%`,
);
console.log(
	`growing them alone is ${sumPlants.toFixed(0)} ms, ` +
		`x${(sumPlants / sumGround).toFixed(1)} the ground's own generate — ` +
		`${(((sumWith - sumWithout - sumPlants) / (sumWith - sumWithout)) * 100).toFixed(0)}% ` +
		`of what the trees add is the mesh, the rest is the growing`,
);
console.log(
	`a chunk that grows nothing still pays ${bare.toFixed(0)} ms, ` +
		`+${bareShare.toFixed(0)}%: the root walk runs whether or not it finds one`,
);
