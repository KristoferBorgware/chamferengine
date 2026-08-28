// What a chunk pays before it grows a single plant.
//
//   npx vite-node tools/trial-root-walk.ts
//
// A chunk that grows nothing still costs `34 ms`, which is now three quarters
// of what the trees cost at all. That is the walk over every cell a plant could
// be rooted in -- the chunk's own triangle plus every cell within `24 m` of its
// rim -- and this takes it apart: how many columns it visits, and what each
// step of it costs at that count.
//
// Wall-clock on a software machine; read the shares.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	ChunkAddress,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import {
	canonicalCell,
	directionToCell,
	joinPath,
	latticePosition,
	neighbour,
	rank,
	splitPath,
} from "chamfer/addressing";
import { Vec3 } from "chamfer/math";
import { plantLayerOf } from "../packages/client/src/PlantDraft.js";
import { hash3 } from "../packages/engine/src/generation/noise/hash3.js";
import { plantDensityAt } from "../packages/engine/src/generation/plants/plantDensityAt.js";
import { plantLayerNoise } from "../packages/engine/src/generation/plants/plantLayerNoise.js";
import { plantSalt } from "../packages/engine/src/generation/plants/plantSalt.js";
import { PlantTemplateStore } from "chamfer/generation";

const settings = new PlanetSettings({ plain: false });
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const terrain = new TerrainGenerator(
	seed,
	shape,
	map,
	settings.terrainOptions(),
);
const layers = settings.plantLayers.map(plantLayerOf).filter((one) => one.on);
const noise = layers.map((one) => plantLayerNoise(one, shape.seaLevelRadius));
const depth = settings.depth;
const chunkLevel = settings.chunkLevel;
const n = shape.n;

// A chunk with land on it, found the way the cost trial finds one.
let state = 20260828;
const next = (): number => {
	state = (state * 1103515245 + 12345) & 0x7fffffff;
	return state / 0x7fffffff;
};
let address: ChunkAddress | null = null;
while (!address) {
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
	const split = splitPath(cell.i, cell.j, depth, chunkLevel);
	const one = new ChunkAddress(cell.face, split.path);
	const chunk = generateChunk(terrain, one, chunkLevel, shape.crustDepth);
	let above = 0;
	for (let slot = 0; slot < chunk.slots; slot++)
		if (chunk.surface[slot * 2]! > shape.seaLevelRadius) above++;
	if (above >= chunk.slots * 0.95) address = one;
}
const chunk = generateChunk(terrain, address, chunkLevel, shape.crustDepth);
const m = chunk.m;
const block = shape.blockSize;
// The reach the templates measure, which is what a chunk actually uses.
const templates = new PlantTemplateStore(
	seed,
	depth,
	shape.blockSize,
	shape.seaLevelRadius,
);
const reach = templates.reachFor(layers);
const hops = Math.max(1, Math.ceil(reach / block));

// The walk itself, timed as one thing and then taken apart.
const keyOf = (f: number, i: number, j: number): number =>
	(f * (n + 1) + i) * (n + 1) + j;
const face: number[] = [];
const iOf: number[] = [];
const jOf: number[] = [];
const slotOf: number[] = [];
const best = (runs: number, run: () => void): number => {
	let least = Infinity;
	for (let p = 0; p < runs; p++) {
		const at = performance.now();
		run();
		least = Math.min(least, performance.now() - at);
	}
	return least;
};

const walk = (): void => {
	face.length = 0;
	iOf.length = 0;
	jOf.length = 0;
	slotOf.length = 0;
	const seen = new Map<number, number>();
	const add = (
		one: { face: number; i: number; j: number },
		slot: number,
	): number => {
		const cell = canonicalCell(one.face, n, one.i, one.j);
		const key = keyOf(cell.face, cell.i, cell.j);
		const held = seen.get(key);
		if (held !== undefined) return held;
		const at = face.length;
		seen.set(key, at);
		face.push(cell.face);
		iOf.push(cell.i);
		jOf.push(cell.j);
		slotOf.push(slot);
		return at;
	};
	let frontier: number[] = [];
	for (let q = 0; q <= m; q++)
		for (let r = 0; q + r <= m; r++) {
			const [i, j] = joinPath(address!.path, q, r, depth);
			frontier.push(add({ face: address!.face, i, j }, rank(q, r, m)));
		}
	for (let hop = 0; hop < hops && frontier.length > 0; hop++) {
		const next2: number[] = [];
		for (const c of frontier)
			for (let d = 0; d < 6; d++) {
				const nb = neighbour(face[c]!, n, iOf[c]!, jOf[c]!, d);
				if (!nb) continue;
				const before = face.length;
				const at = add(nb, -1);
				if (at >= before) next2.push(at);
			}
		frontier = next2;
	}
};

const walkMs = best(3, walk);
const count = face.length;
const owned = slotOf.filter((one) => one >= 0).length;

const ringMs = best(3, () => {
	const ring = new Int32Array(count * 6).fill(-1);
	for (let c = 0; c < count; c++)
		for (let d = 0; d < 6; d++) {
			const nb = neighbour(face[c]!, n, iOf[c]!, jOf[c]!, d);
			if (!nb) continue;
			canonicalCell(nb.face, n, nb.i, nb.j);
			ring[c * 6 + d] = 0;
		}
});
const placeMs = best(3, () => {
	const directions = new Float64Array(count * 3);
	for (let c = 0; c < count; c++) {
		const p = latticePosition(face[c]!, n, iOf[c]!, jOf[c]!);
		directions[c * 3] = p.x;
	}
});
const columnMs = best(3, () => {
	let sink = 0;
	for (let c = 0; c < count; c++)
		sink += terrain.columnAt(face[c]!, iOf[c]!, jOf[c]!).groundRadius;
	if (sink < 0) console.log(sink);
});
const columnRingMs = best(3, () => {
	let sink = 0;
	for (let c = 0; c < count; c++) {
		if (slotOf[c]! >= 0) continue;
		sink += terrain.columnAt(face[c]!, iOf[c]!, jOf[c]!).groundRadius;
	}
	if (sink < 0) console.log(sink);
});

// What deciding whether a plant stands here costs, as it is asked now: the
// noise and the curve first, then the hash.
const askMs = best(3, () => {
	let taken = 0;
	for (let c = 0; c < count; c++) {
		const p = latticePosition(face[c]!, n, iOf[c]!, jOf[c]!);
		for (let l = 0; l < layers.length; l++) {
			const layer = layers[l]!;
			const share = plantDensityAt(
				layer,
				p.x,
				p.y,
				p.z,
				seed,
				noise[l]!,
			);
			const chance = (share * layer.density) / 100;
			if (chance <= 0) continue;
			if (
				hash3(
					iOf[c]!,
					jOf[c]!,
					face[c]!,
					(seed + plantSalt(layer.id)) | 0,
				) < chance
			) {
				taken++;
				break;
			}
		}
	}
	if (taken < 0) console.log(taken);
});

// And the same answer with the hash asked first: a layer can never plant more
// than its own density, so a cell whose hash is over that is refused before any
// noise is read. Same hash, same arguments, so the answer cannot change.
let refused = 0;
let planted = 0;
const hashFirstMs = best(3, () => {
	refused = 0;
	planted = 0;
	for (let c = 0; c < count; c++) {
		for (let l = 0; l < layers.length; l++) {
			const layer = layers[l]!;
			const roll = hash3(
				iOf[c]!,
				jOf[c]!,
				face[c]!,
				(seed + plantSalt(layer.id)) | 0,
			);
			if (roll >= layer.density / 100) {
				refused++;
				continue;
			}
			const p = latticePosition(face[c]!, n, iOf[c]!, jOf[c]!);
			const share = plantDensityAt(
				layer,
				p.x,
				p.y,
				p.z,
				seed,
				noise[l]!,
			);
			if (roll < (share * layer.density) / 100) {
				planted++;
				break;
			}
		}
	}
});

const line = (what: string, ms: number): void =>
	console.log(`${what.padEnd(34)}${ms.toFixed(1).padStart(8)} ms`);

console.log(
	`depth ${depth}, block ${block} m, chunks ${settings.chunkSpan.toFixed(0)} m ` +
		`across, reach ${reach.toFixed(1)} m, ${hops} hops`,
);
console.log(
	`${count.toLocaleString("en-US")} columns walked: ${owned.toLocaleString("en-US")} the chunk holds, ` +
		`${(count - owned).toLocaleString("en-US")} on the ring past its rim\n`,
);
line("the walk itself", walkMs);
line("the six neighbours of each", ringMs);
line("a unit direction for each", placeMs);
line("a terrain column for each", columnMs);
line("  the ring's alone", columnRingMs);
line("is a plant here: noise first", askMs);
line("is a plant here: hash first", hashFirstMs);
console.log(
	`\n${refused.toLocaleString("en-US")} of ${(count * layers.length).toLocaleString("en-US")} ` +
		`asks refused on the hash alone (${((100 * refused) / (count * layers.length)).toFixed(1)}%), ` +
		`${planted} planted`,
);
