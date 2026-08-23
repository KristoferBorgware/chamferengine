/**
 * How far a coarse chunk's own outside ring reaches, against what fine-cell
 * adjacency alone would find.
 *
 * A chunk built `lod` levels coarse generates at a reduced subdivision depth,
 * so its own "one cell past the rim" is one *coarse* cell -- covering roughly
 * `4^lod` fine cells, not the one fine cell a chunk at the finest level reads.
 * Deriving a coarse chunk's readers by chasing fine-to-fine adjacency
 * relationships (the shape the store originally used) can only ever reach one
 * fine cell in either direction of a fine boundary, so it misses every owner
 * whose ground sits further into the neighbour than that.
 *
 *   npx vite-node tools/probe-coarse-reach.ts
 */
import { DeltaStore, STORE_VERSION, coarseCell, packBlockState } from "chamfer/edit";
import { ChunkAddress, coarseChunkKey } from "chamfer/generation";
import { joinPath, neighbour } from "chamfer/addressing";

const DEPTH = 8;
const FINEST = 4;

function ringCells(
	ancestorAddr: ChunkAddress,
	level: number,
	lod: number,
): { i: number; j: number }[] {
	const coarseDepth = DEPTH - lod;
	const coarseN = 1 << coarseDepth;
	const coarseM = 1 << (coarseDepth - level);
	const out: { i: number; j: number }[] = [];
	const seen = new Set<string>();
	for (let q = 0; q <= coarseM; q++)
		for (let r = 0; q + r <= coarseM; r++) {
			if (!(q === 0 || r === 0 || q + r === coarseM)) continue;
			const [i, j] = joinPath(ancestorAddr.path, q, r, coarseDepth);
			for (let k = 0; k < 6; k++) {
				const nb = neighbour(ancestorAddr.face, coarseN, i, j, k);
				if (!nb || nb.face !== ancestorAddr.face) continue;
				const key = `${nb.i}:${nb.j}`;
				if (seen.has(key)) continue;
				seen.add(key);
				out.push(nb);
			}
		}
	return out;
}

function fineFor(
	coarse: { i: number; j: number },
	lod: number,
): { i: number; j: number } | null {
	const scale = 1 << lod;
	for (let di = -2; di <= 2; di++)
		for (let dj = -2; dj <= 2; dj++) {
			const fi = coarse.i * scale + di;
			const fj = coarse.j * scale + dj;
			if (fi < 0 || fj < 0 || fi + fj > 1 << DEPTH) continue;
			const back = coarseCell({ face: 3, i: fi, j: fj, layer: 0 }, DEPTH, lod);
			if (back.i === coarse.i && back.j === coarse.j) return { i: fi, j: fj };
		}
	return null;
}

/** `rowsUnder` computed by chasing only fine-to-fine (1 cell) adjacency. */
function fineChaseOnly(
	store: DeltaStore,
	chunkKey: number,
	chunkLevel: number,
): number[] {
	const fine = FINEST;
	if (chunkLevel >= fine) return store.rowsFor(chunkKey).map((r) => r.chunkKey);
	const span = 4 ** chunkLevel;
	const face = Math.floor(chunkKey / span);
	const path = chunkKey % span;
	const fineSpan = 4 ** fine;
	const inside = (key: number): boolean =>
		Math.floor(key / fineSpan) === face &&
		Math.floor((key % fineSpan) / 4 ** (fine - chunkLevel)) === path;
	const wanted = new Set<number>();
	for (const [key] of store.entries()) if (inside(key)) wanted.add(key);
	// Only the direct rowsFor of each contained fine chunk -- the shape of
	// the original fine-adjacency chase.
	for (const key of [...wanted])
		for (const row of store.rowsFor(key)) wanted.add(row.chunkKey);
	return [...wanted];
}

const address = new ChunkAddress(3, [1, 2, 0, 3]);
let total = 0;
let unreached = 0;
for (const lod of [1, 2, 3]) {
	const level = FINEST - lod;
	const ancestorKey = coarseChunkKey(address.key, FINEST, level);
	const ancestorAddr = ChunkAddress.fromKey(ancestorKey, level);
	for (const coarse of ringCells(ancestorAddr, level, lod)) {
		const fine = fineFor(coarse, lod);
		if (!fine) continue;
		total++;
		const store = new DeltaStore({
			version: STORE_VERSION,
			subdivisionDepth: DEPTH,
			chunkLevel: FINEST,
			registry: ["a", "b"],
		});
		store.write({ face: 3, i: fine.i, j: fine.j, layer: 20 }, packBlockState(0));
		if (fineChaseOnly(store, ancestorKey, level).length === 0) unreached++;
	}
}
console.log(
	`over ${total} outside-ring cells of one chunk at lod 1-3, ` +
		`fine-to-fine adjacency alone never reaches ${unreached} of them ` +
		`(${((100 * unreached) / total).toFixed(0)}%).`,
);
