// What `canonicalCell`'s guard is worth, over the real engine.
//
//   npx vite-node tools/trial-canonical.ts
//
// A cell has more than one name only on a face edge or at an icosahedron
// vertex, which is where one of its three weights is zero -- so the guard is
// three comparisons standing in for a walk of twenty faces. Two measurements,
// because a ratio on a micro-benchmark says nothing about a frame:
//
//   1. The ring of every cell of a large patch, which is the shape of what a
//      mesher and the delta store do, run against the search for time and for
//      agreement.
//   2. Real chunks generated and meshed at the shipped settings, which is what
//      a worker actually spends its time on.
//
// The guard is in the engine, so the search is written out here to compare
// against. Wall-clock measurements, run by hand; not part of make-reference.js,
// whose scripts are plain Node.
import {
	canonicalCell,
	cellRepresentations,
	directionToCell,
	neighbour,
} from "chamfer/addressing";
import { Vec3 } from "chamfer/math";
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import { buildChunkMesh } from "chamfer/mesh";

type Cell = { face: number; i: number; j: number };

/** The search, as `canonicalCell` ran it before the guard. */
function bySearch(face: number, n: number, i: number, j: number): Cell {
	const all = cellRepresentations(face, n, i, j);
	let best = all[0]!;
	for (const c of all) if (c.face < best.face) best = c;
	return best;
}

// ---------------------------------------------------------------------------
// 1. The ring walk.
// ---------------------------------------------------------------------------

const n = 256;
const start = directionToCell(new Vec3(0.3, 0.5, 0.81).normalize(), n);
const keyOf = (c: Cell) => (c.face * (n + 1) + c.i) * (n + 1) + c.j;
const seen = new Set<number>();
const list: Cell[] = [];
const add = (c: Cell) => {
	const k = keyOf(c);
	if (seen.has(k)) return false;
	seen.add(k);
	list.push(c);
	return true;
};
add(canonicalCell(start.face, n, start.i, start.j));
let frontier = [list[0]!];
for (let r = 0; r < 256; r++) {
	const next: Cell[] = [];
	for (const c of frontier)
		for (let d = 0; d < 6; d++) {
			const nb = neighbour(c.face, n, c.i, c.j, d);
			if (!nb) continue;
			const cc = canonicalCell(nb.face, n, nb.i, nb.j);
			if (add(cc)) next.push(cc);
		}
	frontier = next;
}

let steps = 0;
let t = Date.now();
for (const c of list)
	for (let d = 0; d < 6; d++) {
		const nb = neighbour(c.face, n, c.i, c.j, d);
		if (nb) {
			bySearch(nb.face, n, nb.i, nb.j);
			steps++;
		}
	}
const searched = Date.now() - t;
t = Date.now();
for (const c of list)
	for (let d = 0; d < 6; d++) {
		const nb = neighbour(c.face, n, c.i, c.j, d);
		if (nb) canonicalCell(nb.face, n, nb.i, nb.j);
	}
const guarded = Date.now() - t;
t = Date.now();
for (const c of list) for (let d = 0; d < 6; d++) neighbour(c.face, n, c.i, c.j, d);
const walk = Date.now() - t;

let same = 0;
for (const c of list)
	for (let d = 0; d < 6; d++) {
		const nb = neighbour(c.face, n, c.i, c.j, d);
		if (!nb) continue;
		const a = canonicalCell(nb.face, n, nb.i, nb.j);
		const b = bySearch(nb.face, n, nb.i, nb.j);
		if (a.face === b.face && a.i === b.i && a.j === b.j) same++;
	}

console.log(`the ring walk — ${list.length.toLocaleString()} cells at n = ${n}`);
console.log(`  ${steps.toLocaleString()} ring steps`);
console.log(`  search every step  ${searched} ms`);
console.log(
	`  guarded            ${guarded} ms   (${(searched / guarded).toFixed(1)}x)`,
);
console.log(`  neighbour alone    ${walk} ms`);
console.log(`  same answer on     ${same.toLocaleString()} of ${steps.toLocaleString()}`);

// ---------------------------------------------------------------------------
// 2. Real chunks, generated and meshed.
// ---------------------------------------------------------------------------

const settings = new PlanetSettings({ plain: false });
const shape = settings.shape();
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const terrain = new TerrainGenerator(
	seed,
	shape,
	map,
	settings.terrainOptions(),
);

/** A spread of chunks over one face, so this is not one lucky triangle. */
const CHUNKS = 24;
const level = settings.chunkLevel;
const under = 4 ** level;
const keys: number[] = [];
for (let c = 0; c < CHUNKS; c++)
	keys.push(Math.floor((c / CHUNKS) * under) + 3 * under);

function meshAll(): { ms: number; triangles: number } {
	let triangles = 0;
	const began = performance.now();
	for (const key of keys) {
		const chunk = generateChunk(
			terrain,
			ChunkAddress.fromKey(key, level),
			level,
			shape.crustDepth,
		);
		const mesh = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, terrain),
			shape,
			seed,
			{ apron: settings.knobs.apron, surfaceGrid: shape.blockSize },
		);
		triangles += mesh.opaque.triangleCount + mesh.translucent.triangleCount;
	}
	return { ms: performance.now() - began, triangles };
}

meshAll();
const runs = [meshAll(), meshAll(), meshAll()];
const best = Math.min(...runs.map((r) => r.ms));
console.log(
	`\nreal chunks — ${CHUNKS} at chunk level ${level}, depth ${settings.depth}`,
);
console.log(
	`  generate and mesh  ${best.toFixed(0)} ms  ` +
		`(${runs.map((r) => r.ms.toFixed(0)).join(", ")} ms over three runs)`,
);
console.log(`  ${runs[0]!.triangles.toLocaleString()} triangles`);
console.log(`  ${(best / CHUNKS).toFixed(2)} ms a chunk`);

// ---------------------------------------------------------------------------
// 3. World creation, which walks the whole lattice rather than one chunk.
// ---------------------------------------------------------------------------

// `CoarseGrid` canonicalises every lattice point on the planet as it numbers
// them, twice, so this is the one engine path where the guard is asked in bulk.
function buildMap(): number {
	const began = performance.now();
	buildCoarseMap(seed, settings.coarseOptions());
	return performance.now() - began;
}
const maps = [buildMap(), buildMap()];
console.log(`\nworld creation — the coarse map at level ${settings.coarseLevel}`);
console.log(
	`  buildCoarseMap     ${Math.min(...maps).toFixed(0)} ms  ` +
		`(${maps.map((m) => m.toFixed(0)).join(", ")} ms)`,
);
