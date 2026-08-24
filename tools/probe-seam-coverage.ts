/**
 * Whether a fine chunk's shared boundary with a real coarse neighbour is
 * genuinely covered by that neighbour's own cells and apron, in cell space.
 *
 * Reuses the exact set-membership rules `meshChunk` uses (`owns`, `neighbour`,
 * `canonicalCell`) to compute, independently for two real chunks at two real
 * levels of detail, every cell each one draws a cap for -- its own triangle
 * plus its apron. Restricted to ground that genuinely belongs to the coarse
 * chunk's own triangle (its `coarseCell` mapping falls inside it) -- not every
 * cell near the fine chunk's rim, which reaches into other neighbours'
 * territory (siblings included) that this particular pair was never
 * responsible for.
 *
 *   npx vite-node tools/probe-seam-coverage.ts
 */
import {
	canonicalCell,
	joinPath,
	latticeWeights,
	neighbour,
	splitPath,
} from "chamfer/addressing";
import { chunksHolding, coarseCell, ringAround } from "chamfer/edit";
import { ChunkAddress, coarseChunkKey } from "chamfer/generation";

interface Cell {
	face: number;
	i: number;
	j: number;
}

function owns(address: ChunkAddress, depth: number, n: number, cell: Cell): boolean {
	const w = latticeWeights(n, cell.i, cell.j);
	if (w[0] === 0 || w[1] === 0 || w[2] === 0)
		if (canonicalCell(cell.face, n, cell.i, cell.j).face !== cell.face)
			return false;
	const split = splitPath(cell.i, cell.j, depth, address.path.length);
	for (let level = 0; level < split.path.length; level++)
		if (split.path[level] !== address.path[level]) return false;
	return true;
}

function inTriangle(address: ChunkAddress, depth: number, cell: Cell): boolean {
	const split = splitPath(cell.i, cell.j, depth, address.path.length);
	for (let level = 0; level < split.path.length; level++)
		if (split.path[level] !== address.path[level]) return false;
	return true;
}

function degreeOf(n: number, i: number, j: number): number {
	return latticeWeights(n, i, j).filter((w) => w > 0).length === 1 ? 5 : 6;
}

/** Every cell a real build of this chunk would draw a cap for: own + apron. */
function drawnCells(address: ChunkAddress, depth: number): Set<string> {
	const n = 1 << depth;
	const m = 1 << (depth - address.path.length);
	const out = new Set<string>();
	const key = (c: Cell) => `${c.face}:${c.i}:${c.j}`;
	const apron = new Map<string, Cell>();

	for (let q = 0; q <= m; q++)
		for (let r = 0; q + r <= m; r++) {
			const [i, j] = joinPath(address.path, q, r, depth);
			const cell = { face: address.face, i, j };
			if (!owns(address, depth, n, cell)) continue;
			out.add(key(cell));
			const degree = degreeOf(n, i, j);
			for (let k = 0; k < 6; k++) {
				const nb = k < degree ? neighbour(address.face, n, i, j, k) : null;
				if (!nb) continue;
				const isOutward = !(
					nb.face === address.face &&
					inTriangle(address, depth, nb) &&
					owns(address, depth, n, nb)
				);
				if (isOutward) {
					const canon = canonicalCell(nb.face, n, nb.i, nb.j);
					apron.set(key(canon), canon);
				}
			}
		}
	for (const [cq, cr] of [
		[0, 0],
		[m, 0],
		[0, m],
	] as const) {
		const [ci, cj] = joinPath(address.path, cq, cr, depth);
		const corner = canonicalCell(address.face, n, ci, cj);
		apron.set(key(corner), corner);
		const degree = degreeOf(n, corner.i, corner.j);
		for (let k = 0; k < degree; k++) {
			const nb = neighbour(corner.face, n, corner.i, corner.j, k);
			if (!nb) continue;
			const canon = canonicalCell(nb.face, n, nb.i, nb.j);
			apron.set(key(canon), canon);
		}
	}
	for (const [k, cell] of apron)
		if (!(cell.face === address.face && inTriangle(address, depth, cell)))
			out.add(k);
	return out;
}

/** Every coarse chunk genuinely touching a fine chunk's own rim, at `lod` steps up. */
function realNeighbours(
	fine: ChunkAddress,
	fineDepth: number,
	lod: number,
): number[] {
	const coarseLevel = fine.path.length - lod;
	const coarseDepth = fineDepth - lod;
	const parentKey = coarseChunkKey(fine.key, fine.path.length, coarseLevel);
	const m = 1 << (fineDepth - fine.path.length);
	const rim: Cell[] = [];
	for (let q = 0; q <= m; q++)
		for (let r = 0; q + r <= m; r++) {
			if (q > 0 && r > 0 && q + r < m) continue;
			const [i, j] = joinPath(fine.path, q, r, fineDepth);
			rim.push({ face: fine.face, i, j });
		}
	const touching = new Set<number>();
	for (const cell of rim) {
		const coarse = coarseCell({ ...cell, layer: 0 }, fineDepth, lod);
		for (const { chunkKey } of chunksHolding(
			{ ...coarse, layer: 0 },
			coarseDepth,
			coarseLevel,
		))
			if (chunkKey !== parentKey) touching.add(chunkKey);
	}
	return [...touching];
}

/** Cells covered by neither side, restricted to the coarse chunk's own ground. */
function uncoveredBetween(
	fine: ChunkAddress,
	fineDepth: number,
	coarseKey: number,
	coarseLevel: number,
	lod: number,
): Cell[] {
	const coarseDepth = fineDepth - lod;
	const fineDrawn = drawnCells(fine, fineDepth);
	const coarse = ChunkAddress.fromKey(coarseKey, coarseLevel);
	const coarseDrawn = drawnCells(coarse, coarseDepth);

	const m = 1 << (fineDepth - fine.path.length);
	const rim: Cell[] = [];
	for (let q = 0; q <= m; q++)
		for (let r = 0; q + r <= m; r++) {
			if (q > 0 && r > 0 && q + r < m) continue;
			const [i, j] = joinPath(fine.path, q, r, fineDepth);
			rim.push({ face: fine.face, i, j });
		}
	const region = ringAround(rim, 1 << fineDepth, lod + 1);

	const bad: Cell[] = [];
	for (const cell of region) {
		const asCoarse = coarseCell({ ...cell, layer: 0 }, fineDepth, lod);
		if (!inTriangle(coarse, coarseDepth, asCoarse)) continue;
		const fineKey = `${cell.face}:${cell.i}:${cell.j}`;
		const coarseKey2 = `${asCoarse.face}:${asCoarse.i}:${asCoarse.j}`;
		if (!fineDrawn.has(fineKey) && !coarseDrawn.has(coarseKey2)) bad.push(cell);
	}
	return bad;
}

// Sweep many fine chunks across several faces, both lod-1 and lod-2 jumps,
// against every coarse neighbour that genuinely touches their own rim.
const DEPTH = 10;
const FINE_LEVEL = 5;
let pairs = 0;
let totalChecked = 0;
let totalBad = 0;
const worstExamples: string[] = [];

for (const face of [0, 3, 7, 11, 15]) {
	for (const path of [
		[1, 2, 0, 3, 1],
		[2, 1, 3, 0, 2],
		[0, 0, 1, 2, 3],
		[3, 3, 2, 1, 0],
	]) {
		const fine = new ChunkAddress(face, path);
		for (const lod of [1, 2]) {
			if (path.length - lod < 0) continue;
			const neighbours = realNeighbours(fine, DEPTH, lod);
			for (const coarseKey of neighbours) {
				pairs++;
				const bad = uncoveredBetween(
					fine,
					DEPTH,
					coarseKey,
					path.length - lod,
					lod,
				);
				totalChecked++;
				totalBad += bad.length;
				if (bad.length > 0 && worstExamples.length < 6)
					worstExamples.push(
						`face ${face} path ${path.join("")} lod ${lod} vs ${coarseKey}: ${bad.length} bad, e.g. ${bad[0]!.face}:${bad[0]!.i}:${bad[0]!.j}`,
					);
			}
		}
	}
}

console.log(
	`${pairs} fine/coarse pairs checked across 5 faces, 4 chunks each, lod 1 and 2.`,
);
console.log(`total cells found uncovered by either side: ${totalBad}`);
for (const e of worstExamples) console.log("  " + e);
