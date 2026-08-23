// (1) Can ordinary play hand the same cell to DeltaStore under two face names?
// (2) Split the mesher's read set: which parts does chunksReading not cover?
import {
	canonicalCell,
	cellCorners,
	cellRepresentations,
	directionToCell,
	joinPath,
	latticeWeights,
	neighbour,
	splitPath,
} from "chamfer/addressing";
import { cellSlot, chunksReading } from "chamfer/edit";
import { ChunkAddress } from "chamfer/generation";
import { Vec3 } from "chamfer/math";

const DEPTH = 8;
const LEVEL = 4;
const n = 1 << DEPTH;
const m = 1 << (DEPTH - LEVEL);

console.log("=== (1) one cell, two face names, two store rows ===");
let checked = 0;
let bothSeen = 0;
const examples: string[] = [];
for (let face = 0; face < 3; face++)
	for (let i = 0; i <= n; i++)
		for (let j = 0; i + j <= n; j++) {
			const w = latticeWeights(n, i, j);
			const zeros = w.filter((x) => x === 0).length;
			if (zeros !== 1) continue; // on a face edge, not a vertex
			const names = cellRepresentations(face, n, i, j);
			if (names.length !== 2) continue;
			if (names[0]!.face !== face) continue; // count each cell once
			checked++;
			// Sample directions across the cell's own polygon and see which
			// face name positionToCell/directionToCell reports.
			const corners = cellCorners(face, n, i, j);
			const centre = corners
				.reduce((a, c) => a.add(c), new Vec3(0, 0, 0))
				.scale(1 / corners.length)
				.normalize();
			const seen = new Set<number>();
			for (const c of corners)
				for (const t of [0.1, 0.35, 0.6, 0.85, 0.97]) {
					const d = centre
						.scale(1 - t)
						.add(c.scale(t))
						.normalize();
					const got = directionToCell(d, n);
					const canon = canonicalCell(got.face, n, got.i, got.j);
					const want = canonicalCell(face, n, i, j);
					if (
						canon.face !== want.face ||
						canon.i !== want.i ||
						canon.j !== want.j
					)
						continue; // a neighbouring cell, not this one
					seen.add(got.face);
				}
			if (seen.size > 1) {
				bothSeen++;
				if (examples.length < 3) {
					const A = { ...names[0]!, layer: 7 };
					const B = { ...names[1]!, layer: 7 };
					examples.push(
						`face-${A.face} (${A.i},${A.j}) / face-${B.face} (${B.i},${B.j}) ` +
							`-> cellSlot rows ${JSON.stringify(cellSlot(A, DEPTH, LEVEL))} and ${JSON.stringify(cellSlot(B, DEPTH, LEVEL))}`,
					);
				}
			}
		}
console.log(`face-edge cells walked over 3 faces      : ${checked}`);
console.log(`of those, directionToCell returns BOTH names from inside the cell: ${bothSeen}`);
for (const e of examples) console.log("   " + e);

console.log("\n=== (2) mesher read set vs store routing, split by role ===");
function inChunk(path: readonly number[], i: number, j: number): boolean {
	const s = splitPath(i, j, DEPTH, LEVEL);
	for (let l = 0; l < s.path.length; l++)
		if (s.path[l] !== path[l]) return false;
	return true;
}
function owns(
	face: number,
	path: readonly number[],
	i: number,
	j: number,
): boolean {
	const w = latticeWeights(n, i, j);
	if (w[0] === 0 || w[1] === 0 || w[2] === 0)
		if (canonicalCell(face, n, i, j).face !== face) return false;
	return inChunk(path, i, j);
}
const pack = (c: { face: number; i: number; j: number }): number =>
	(canonicalCell(c.face, n, c.i, c.j).face * 262144 +
		canonicalCell(c.face, n, c.i, c.j).i) *
		262144 +
	canonicalCell(c.face, n, c.i, c.j).j;

const roles = {
	owned: new Set<number>(),
	ownedRing: new Set<number>(),
	apronOwn: new Set<number>(),
	apronRing: new Set<number>(),
};
const KEYS: number[] = [];
for (let face = 0; face < 20; face++)
	for (let v = 0; v < 4 ** LEVEL; v += 53) KEYS.push(face * 4 ** LEVEL + v);

const totals = { owned: 0, ownedRing: 0, apronOwn: 0, apronRing: 0 };
const missed = { owned: 0, ownedRing: 0, apronOwn: 0, apronRing: 0 };
for (const key of KEYS) {
	const addr = ChunkAddress.fromKey(key, LEVEL);
	const face = addr.face;
	for (const s of Object.values(roles)) s.clear();
	const apron = new Map<number, { face: number; i: number; j: number }>();

	for (let q = 0; q <= m; q++)
		for (let r = 0; q + r <= m; r++) {
			const [i, j] = joinPath(addr.path, q, r, DEPTH);
			if (!owns(face, addr.path, i, j)) continue;
			roles.owned.add(pack({ face, i, j }));
			const degree = cellCorners(face, n, i, j).length;
			for (let k = 0; k < degree; k++) {
				const nb = neighbour(face, n, i, j, k);
				if (!nb) continue;
				roles.ownedRing.add(pack(nb));
				const outward = !(
					nb.face === face &&
					inChunk(addr.path, nb.i, nb.j) &&
					owns(face, addr.path, nb.i, nb.j)
				);
				if (outward) {
					const c = canonicalCell(nb.face, n, nb.i, nb.j);
					apron.set(pack(c), c);
				}
			}
		}
	for (const [cq, cr] of [
		[0, 0],
		[m, 0],
		[0, m],
	] as const) {
		const [ci, cj] = joinPath(addr.path, cq, cr, DEPTH);
		const corner = canonicalCell(face, n, ci, cj);
		apron.set(pack(corner), corner);
		const degree = cellCorners(corner.face, n, corner.i, corner.j).length;
		for (let k = 0; k < degree; k++) {
			const nb = neighbour(corner.face, n, corner.i, corner.j, k);
			if (!nb) continue;
			const c = canonicalCell(nb.face, n, nb.i, nb.j);
			apron.set(pack(c), c);
		}
	}
	for (const cell of apron.values()) {
		if (cell.face === face && inChunk(addr.path, cell.i, cell.j)) continue;
		roles.apronOwn.add(pack(cell));
		const degree = cellCorners(cell.face, n, cell.i, cell.j).length;
		for (let k = 0; k < degree; k++) {
			const nb = neighbour(cell.face, n, cell.i, cell.j, k);
			if (nb) roles.apronRing.add(pack(nb));
		}
	}
	// strip cells already counted in an earlier role
	for (const p of roles.owned) roles.ownedRing.delete(p);
	for (const p of roles.owned) roles.apronOwn.delete(p);
	for (const p of roles.ownedRing) roles.apronOwn.delete(p);
	for (const p of roles.owned) roles.apronRing.delete(p);
	for (const p of roles.ownedRing) roles.apronRing.delete(p);
	for (const p of roles.apronOwn) roles.apronRing.delete(p);

	for (const [name, set] of Object.entries(roles) as [
		keyof typeof roles,
		Set<number>,
	][]) {
		for (const p of set) {
			const cf = Math.floor(p / (262144 * 262144));
			const ci = Math.floor((p % (262144 * 262144)) / 262144);
			const cj = p % 262144;
			totals[name]++;
			if (
				!chunksReading({ face: cf, i: ci, j: cj, layer: 0 }, DEPTH, LEVEL).includes(
					key,
				)
			)
				missed[name]++;
		}
	}
}
console.log(`${KEYS.length} chunks, depth ${DEPTH}, chunk level ${LEVEL}`);
for (const name of ["owned", "ownedRing", "apronOwn", "apronRing"] as const)
	console.log(
		`  ${name.padEnd(10)} : ${(totals[name] / KEYS.length).toFixed(1)} cells a chunk, ` +
			`${(missed[name] / KEYS.length).toFixed(1)} of them never routed an edit ` +
			`(${((100 * missed[name]) / Math.max(1, totals[name])).toFixed(1)}%)`,
	);
