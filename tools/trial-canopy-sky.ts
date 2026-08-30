// What a canopy does to the sky exposure of the ground under it.
//
//   npx vite-node tools/trial-canopy-sky.ts
//
// `skyExposure` asks each of a cell's six neighbours how much taller its
// ground stands, and darkens the cell in proportion, bottoming out at
// `SKY_FLOOR` -- the value meant for a cell sealed on every side inside a
// cave. The number it asks for is the column's band top, and `plantChunk`
// raises that to the top of whatever it grew, because the band is what the
// mesher walks to draw a canopy. So a tree reads as a cliff of its own height
// on every side.
//
// This measures both readings over the same cells: the band's top, which is
// what shipped, and the terrain's own surface, which no plant moves.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import { plantLayerOf } from "../packages/client/src/PlantDraft.js";
import { biomeFieldFor } from "../packages/client/src/biomeFieldFor.js";
import {
	ChunkAddress,
	PlantTemplateStore,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	makeBiomeSample,
	plantChunk,
	seedFromString,
} from "chamfer/generation";
import { DIRECTIONS, canonicalCell, directionToCell, rank, splitPath } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";
import { skyExposure } from "../packages/engine/src/light/skyExposure.js";

const SKY_REACH = 6;
const SKY_FLOOR = 0.12;

const settings = new PlanetSettings({ plain: false });
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const field = biomeFieldFor(seed, shape, map, settings);
if (!field) throw new Error("this world has no biomes, so it has no forest");
const layers = settings.plantLayers.map(plantLayerOf);
const terrain = new TerrainGenerator(seed, shape, map, settings.terrainOptions());
const templates = new PlantTemplateStore(seed, shape.subdivisionDepth, shape.blockSize, shape.seaLevelRadius);

const wanted = new Set(layers.flatMap((l) => l.biomes ?? []));
const scratch = makeBiomeSample();
const n = shape.n;
const found: ReturnType<typeof generateChunk>[] = [];
let pick = 987654321;
for (let tries = 0; tries < 4000 && found.length < 4; tries++) {
	pick = (Math.imul(pick, 1664525) + 1013904223) >>> 0;
	const z = (pick / 2 ** 32) * 2 - 1;
	pick = (Math.imul(pick, 1664525) + 1013904223) >>> 0;
	const phi = (pick / 2 ** 32) * Math.PI * 2;
	const r = Math.sqrt(1 - z * z);
	const dir = new Vec3(r * Math.cos(phi), r * Math.sin(phi), z);
	const at = field.readAt(dir.x, dir.y, dir.z, scratch);
	if (!wanted.has(field.biomes[at]?.name ?? "")) continue;
	const cell = directionToCell(dir, n);
	const home = canonicalCell(cell.face, n, cell.i, cell.j);
	const split = splitPath(home.i, home.j, settings.depth, settings.chunkLevel);
	const chunk = generateChunk(terrain, new ChunkAddress(home.face, split.path), settings.chunkLevel, shape.crustDepth);
	const grown = plantChunk(chunk, terrain, shape, layers, seed, settings.depth, templates, field);
	if (grown && grown.leaf > 0) found.push(chunk);
}
if (found.length === 0) throw new Error("no chunk asked for grew a leaf");

console.log(`${found.length} forested chunks of the shipped world, depth ${settings.depth}`);

const band: number[] = [];
const ground: number[] = [];
for (const chunk of found) {
	const m = chunk.m;
	const qr: [number, number][] = new Array(chunk.slots);
	for (let r = 0; r <= m; r++) for (let q = 0; q + r <= m; q++) qr[rank(q, r, m)] = [q, r];
	for (let slot = 0; slot < chunk.slots; slot++) {
		const [q, r] = qr[slot]!;
		const ring: number[] = [];
		let whole = true;
		for (const [dq, dr] of DIRECTIONS) {
			const nq = q + dq;
			const nr = r + dr;
			if (nq < 0 || nr < 0 || nq + nr > m) { whole = false; break; }
			ring.push(rank(nq, nr, m));
		}
		if (!whole) continue;
		// The cell being lit is the terrain surface of this column, which is
		// where a player walks and what the pictures show.
		const mine = shape.layerOfSurface(chunk.surface[slot * 2]!);
		band.push(skyExposure(mine, ring.map((s) => chunk.band[s * 2]!), SKY_REACH, SKY_FLOOR));
		ground.push(skyExposure(mine, ring.map((s) => shape.layerOfSurface(chunk.surface[s * 2]!)), SKY_REACH, SKY_FLOOR));
	}
}

function report(name: string, all: number[]): void {
	const sorted = [...all].sort((a, b) => a - b);
	const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
	const floored = all.filter((v) => v < SKY_FLOOR + 0.05).length;
	console.log(
		`  ${name.padEnd(24)} mean ${(all.reduce((s, v) => s + v, 0) / all.length).toFixed(3)}` +
			`   5th ${at(0.05).toFixed(3)}  50th ${at(0.5).toFixed(3)}` +
			`   at the cave floor: ${((100 * floored) / all.length).toFixed(1)}%`,
	);
}
console.log(`\n${band.length.toLocaleString("en-US")} ground cells`);
report("from the band's top", band);
report("from the terrain", ground);
