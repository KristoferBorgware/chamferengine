// Scratch probe: the mesher's reach against the store's routing rule.
// For one chunk, enumerate exactly the cells meshChunk asks the sampler for,
// and check which of them chunksReading() would name this chunk for.
// Run: npx vite-node tools/_lens4.ts
import { chunksReading, offsetIn } from "chamfer/edit";
import {
	canonicalCell,
	cellCorners,
	joinPath,
	latticeWeights,
	neighbour,
	splitPath,
} from "chamfer/addressing";
import { ChunkAddress } from "chamfer/generation";

const D = 8;
const C = 4;
const n = 1 << D;
const m = 1 << (D - C);

function owns(addr: ChunkAddress, i: number, j: number): boolean {
	const w = latticeWeights(n, i, j);
	if (w[0] === 0 || w[1] === 0 || w[2] === 0)
		if (canonicalCell(addr.face, n, i, j).face !== addr.face) return false;
	const split = splitPath(i, j, D, C);
	for (let l = 0; l < split.path.length; l++)
		if (split.path[l] !== addr.path[l]) return false;
	return true;
}
const inChunk = (addr: ChunkAddress, i: number, j: number): boolean => {
	const split = splitPath(i, j, D, C);
	for (let l = 0; l < split.path.length; l++)
		if (split.path[l] !== addr.path[l]) return false;
	return true;
};
const key = (f: number, i: number, j: number) => `${f}:${i}:${j}`;

let chunks = 0;
const totals = {
	owned: 0,
	ownedRing: 0,
	apronOwn: 0,
	apronRing: 0,
	apronRingUnrouted: 0,
	held: 0,
};
const firstMiss: string[] = [];

for (let chunkKey = 0; chunkKey < 4 ** C; chunkKey += 17) {
	chunks++;
	const addr = ChunkAddress.fromKey(chunkKey, C);
	const read = new Map<string, string>(); // cell -> role
	const note = (f: number, i: number, j: number, role: string): void => {
		const k = key(f, i, j);
		if (!read.has(k)) read.set(k, role);
	};
	const apron = new Map<string, { face: number; i: number; j: number }>();

	for (let q = 0; q <= m; q++)
		for (let r = 0; q + r <= m; r++) {
			const [i, j] = joinPath(addr.path, q, r, D);
			if (!owns(addr, i, j)) continue;
			note(addr.face, i, j, "owned");
			const degree = cellCorners(addr.face, n, i, j).length;
			for (let k = 0; k < degree; k++) {
				const nb = neighbour(addr.face, n, i, j, k);
				if (!nb) continue;
				note(nb.face, nb.i, nb.j, "ownedRing");
				const out = !(
					nb.face === addr.face &&
					inChunk(addr, nb.i, nb.j) &&
					owns(addr, nb.face, nb.i, nb.j)
				);
				if (out) {
					const c = canonicalCell(nb.face, n, nb.i, nb.j);
					apron.set(key(c.face, c.i, c.j), c);
				}
			}
		}
	// The three corners and their rings, added outright.
	for (const [cq, cr] of [
		[0, 0],
		[m, 0],
		[0, m],
	] as const) {
		const [ci, cj] = joinPath(addr.path, cq, cr, D);
		const corner = canonicalCell(addr.face, n, ci, cj);
		apron.set(key(corner.face, corner.i, corner.j), corner);
		const degree = cellCorners(corner.face, n, corner.i, corner.j).length;
		for (let k = 0; k < degree; k++) {
			const nb = neighbour(corner.face, n, corner.i, corner.j, k);
			if (!nb) continue;
			const c = canonicalCell(nb.face, n, nb.i, nb.j);
			apron.set(key(c.face, c.i, c.j), c);
		}
	}

	for (const c of apron.values()) {
		if (c.face === addr.face && inChunk(addr, c.i, c.j)) continue;
		note(c.face, c.i, c.j, "apronOwn");
		const degree = cellCorners(c.face, n, c.i, c.j).length;
		for (let k = 0; k < degree; k++) {
			const nb = neighbour(c.face, n, c.i, c.j, k);
			if (nb) note(nb.face, nb.i, nb.j, "apronRing");
		}
	}

	for (const [k, role] of read) {
		const [f, i, j] = k.split(":").map(Number) as [number, number, number];
		totals[role as keyof typeof totals]++;
		if (offsetIn(addr.path, i, j, D) && f === addr.face) totals.held++;
		const told = chunksReading({ face: f, i, j, layer: 0 }, D, C);
		if (!told.includes(chunkKey)) {
			if (role !== "apronRing")
				firstMiss.push(`UNEXPECTED ${role} ${k} chunk ${chunkKey}`);
			else {
				totals.apronRingUnrouted++;
				if (firstMiss.length < 5)
					firstMiss.push(
						`apronRing ${k} is read by chunk ${chunkKey} and chunksReading names ${told}`,
					);
			}
		}
	}
}

console.log("chunks sampled", chunks);
for (const [k, v] of Object.entries(totals))
	console.log(` ${k}: ${(v / chunks).toFixed(1)} a chunk (${v} total)`);
for (const line of firstMiss.slice(0, 6)) console.log(" ", line);
