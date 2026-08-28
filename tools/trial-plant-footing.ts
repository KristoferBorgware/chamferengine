// How often the ground a plant would stand on is not there.
//
//   npx vite-node tools/trial-plant-footing.ts [chunks]
//
// `columnAt` gives the height field's surface, and the carve and the caves then
// hollow the top of that column out from under it. A foot placed at the height
// field therefore stands on nothing wherever that happened, which is a tree
// hanging in the air off a cliff edge or over a cave mouth. This counts how
// many columns of a real world are in that state, and how far down the block
// they should stand on actually is.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	BlockType,
	ChunkAddress,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import { canonicalCell, directionToCell, joinPath, splitPath } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

const WANT = Number(process.argv[2] ?? 40);
const LOOK = 12;

const settings = new PlanetSettings({ plain: false });
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const terrain = new TerrainGenerator(seed, shape, map, settings.terrainOptions());
const chunkLevel = settings.chunkLevel;
const n = 2 ** settings.depth;

let state = 20260828;
const next = (): number => {
	state = (state * 1103515245 + 12345) & 0x7fffffff;
	return state / 0x7fffffff;
};

const drop = new Map<number, number>();
let land = 0;
let chunks = 0;
for (let tries = 0; tries < 4000 && chunks < WANT; tries++) {
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
	const address = new ChunkAddress(cell.face, split.path);
	const chunk = generateChunk(terrain, address, chunkLevel, shape.crustDepth);
	let above = 0;
	for (let slot = 0; slot < chunk.slots; slot++)
		if (chunk.surface[slot * 2]! > shape.seaLevelRadius) above++;
	if (above < chunk.slots * 0.95) continue;
	chunks++;
	const m = chunk.m;
	for (let q = 0; q <= m; q++)
		for (let r = 0; q + r <= m; r++) {
			const [i, j] = joinPath(address.path, q, r, settings.depth);
			const column = terrain.columnAt(address.face, i, j);
			if (column.groundRadius <= shape.seaLevelRadius) continue;
			land++;
			const from = shape.layerOfSurface(column.groundRadius);
			let step = 0;
			while (
				step <= LOOK &&
				from + step < shape.crustDepth &&
				terrain.blockAt(column, from + step) === BlockType.AIR
			)
				step++;
			const key = step > LOOK ? -1 : step;
			drop.set(key, (drop.get(key) ?? 0) + 1);
		}
}

console.log(
	`depth ${settings.depth}, block ${settings.knobs.blockSize} m — ` +
		`${chunks} land chunks, ${land.toLocaleString("en-US")} land columns`,
);
const share = (count: number): string =>
	`${((100 * count) / land).toFixed(3)}%`;
for (const step of [0, 1, 2, 3, 4, 5, 6]) {
	const count = drop.get(step) ?? 0;
	if (count === 0) continue;
	console.log(
		`${step} layers down`.padEnd(18) +
			`${count.toLocaleString("en-US")}`.padStart(9) +
			`  ${share(count)}`,
	);
}
let deeper = drop.get(-1) ?? 0;
for (const [step, count] of drop) if (step > 6) deeper += count;
console.log(
	`more than 6 down`.padEnd(18) +
		`${deeper.toLocaleString("en-US")}`.padStart(9) +
		`  ${share(deeper)}`,
);
let moved = 0;
for (const [step, count] of drop) if (step !== 0) moved += count;
console.log(
	`\nnot standing where the height field said: ${share(moved)} of land columns`,
);
