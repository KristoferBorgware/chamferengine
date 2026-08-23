/**
 * Which cells the APRON's own ring[] reads, and whether an edit there reaches
 * the chunk. Mirrors meshChunk's apron construction exactly.
 *
 *   npx vite-node <this file>
 */
import {
	DeltaStore,
	chunksHolding,
	chunksReading,
	packBlockState,
	STORE_VERSION,
} from "chamfer/edit";
import { ChunkAddress } from "chamfer/generation";
import {
	canonicalCell,
	cellCorners,
	joinPath,
	latticeWeights,
	neighbour,
	splitPath,
} from "chamfer/addressing";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const N = 1 << DEPTH;
const M = 1 << (DEPTH - CHUNK_LEVEL);

const face = 3;
const path = [1, 2, 0, 3];
const here = new ChunkAddress(face, path);
const key = here.key;

function inChunk(i: number, j: number): boolean {
	const split = splitPath(i, j, DEPTH, CHUNK_LEVEL);
	for (let level = 0; level < split.path.length; level++)
		if (split.path[level] !== path[level]) return false;
	return true;
}

function owns(f: number, i: number, j: number): boolean {
	const w = latticeWeights(N, i, j);
	if (w[0] === 0 || w[1] === 0 || w[2] === 0)
		if (canonicalCell(f, N, i, j).face !== f) return false;
	return inChunk(i, j);
}

const id = (f: number, i: number, j: number) => `${f}:${i}:${j}`;

// --- the apron set, exactly as meshChunk builds it -------------------------
const apron = new Map<string, { face: number; i: number; j: number }>();
for (let q = 0; q <= M; q++)
	for (let r = 0; q + r <= M; r++) {
		const [i, j] = joinPath(path, q, r, DEPTH);
		if (!owns(face, i, j)) continue;
		const degree = cellCorners(face, N, i, j).length;
		for (let k = 0; k < degree; k++) {
			const nb = neighbour(face, N, i, j, k);
			if (!nb) continue;
			const outward = !(
				nb.face === face &&
				inChunk(nb.i, nb.j) &&
				owns(nb.face, nb.i, nb.j)
			);
			if (!outward) continue;
			const c = canonicalCell(nb.face, N, nb.i, nb.j);
			apron.set(id(c.face, c.i, c.j), c);
		}
	}
for (const [cq, cr] of [
	[0, 0],
	[M, 0],
	[0, M],
] as const) {
	const [ci, cj] = joinPath(path, cq, cr, DEPTH);
	const corner = canonicalCell(face, N, ci, cj);
	apron.set(id(corner.face, corner.i, corner.j), corner);
	const degree = cellCorners(corner.face, N, corner.i, corner.j).length;
	for (let k = 0; k < degree; k++) {
		const nb = neighbour(corner.face, N, corner.i, corner.j, k);
		if (!nb) continue;
		const c = canonicalCell(nb.face, N, nb.i, nb.j);
		apron.set(id(c.face, c.i, c.j), c);
	}
}

// The apron cells actually drawn (the skip at meshChunk:299).
const drawn = [...apron.values()].filter(
	(c) => !(c.face === face && inChunk(c.i, c.j)),
);

// --- who does this chunk hold a slot for? ---------------------------------
const held = new Set<string>();
for (let q = 0; q <= M; q++)
	for (let r = 0; q + r <= M; r++) {
		const [i, j] = joinPath(path, q, r, DEPTH);
		held.add(id(face, i, j));
	}

// --- the ring meshApronCell reads for each drawn apron cell ---------------
const ringCells = new Map<string, { face: number; i: number; j: number }>();
for (const cell of drawn) {
	const degree = cellCorners(cell.face, N, cell.i, cell.j).length;
	for (let k = 0; k < degree; k++) {
		const nb = neighbour(cell.face, N, cell.i, cell.j, k);
		if (!nb) continue;
		ringCells.set(id(nb.face, nb.i, nb.j), nb);
	}
}

// --- can an edit in each of those reach this chunk? -----------------------
let reachable = 0;
const unreachable: { face: number; i: number; j: number }[] = [];
for (const nb of ringCells.values()) {
	const canon = canonicalCell(nb.face, N, nb.i, nb.j);
	if (held.has(id(canon.face, canon.i, canon.j)) || held.has(id(nb.face, nb.i, nb.j))) {
		reachable++;
		continue;
	}
	const readers = chunksReading(
		{ face: nb.face, i: nb.i, j: nb.j, layer: 40 },
		DEPTH,
		CHUNK_LEVEL,
	);
	if (readers.includes(key)) reachable++;
	else unreachable.push(nb);
}

console.log(`chunk key ${key}, face ${face}, path [${path}]`);
console.log(`  slots held           : ${((M + 1) * (M + 2)) / 2}`);
console.log(`  apron cells drawn    : ${drawn.length}`);
console.log(`  cells apron ring[] reads: ${ringCells.size}`);
console.log(`  of those, edit reaches this chunk: ${reachable}`);
console.log(`  of those, edit NEVER reaches it  : ${unreachable.length}`);

// --- end to end: write an edit at an unreachable cell, ask the store ------
if (unreachable.length) {
	const store = new DeltaStore({
		version: STORE_VERSION,
		subdivisionDepth: DEPTH,
		chunkLevel: CHUNK_LEVEL,
		registry: ["chamfer:air", "chamfer:stone"],
	});
	const victim = unreachable[0]!;
	const told = store.write(
		{ face: victim.face, i: victim.i, j: victim.j, layer: 40 },
		packBlockState(0, 0),
	);
	console.log(
		`\n  broke a block at ${id(victim.face, victim.i, victim.j)} layer 40`,
	);
	console.log(`  chunks told: ${told.length}; this chunk among them: ${told.includes(key)}`);
	console.log(`  rows this chunk would be handed: ${store.rowsFor(key).length}`);
	const owner = chunksHolding(
		{ face: victim.face, i: victim.i, j: victim.j, layer: 40 },
		DEPTH,
		CHUNK_LEVEL,
	);
	console.log(`  owner chunk keys: ${owner.map((h) => h.chunkKey).join(", ")}`);
	console.log(
		`  first five unreachable: ${unreachable
			.slice(0, 5)
			.map((c) => id(c.face, c.i, c.j))
			.join("  ")}`,
	);
}
