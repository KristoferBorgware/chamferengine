/**
 * How far apart a fine chunk's own ground and its coarse neighbour's apron
 * ground actually stand, on real terrain, against the apron's fixed 1 cm drop.
 *
 * The apron does not draw the SAME point at two resolutions -- it draws each
 * side's OWN sampling of the nearby ground, at each side's own cell size. A
 * coarse cell's cap is one flat hexagon over an area the fine chunk covers
 * with many smaller ones, so this measures how far that single flat height can
 * stand from what the fine terrain actually does underneath it.
 *
 * This is the size of the difference, not where it shows.
 * `tools/probe-seam-crack.ts` finds the edges it actually opens a band at.
 *
 *   npx vite-node tools/probe-seam-height.ts
 */
import {
	canonicalCell,
	joinPath,
	latticeWeights,
	neighbour,
} from "chamfer/addressing";
import { chunksHolding, coarseCell } from "chamfer/edit";
import {
	ChunkAddress,
	TerrainGenerator,
	buildCoarseMap,
	coarseChunkKey,
	seedFromString,
} from "chamfer/generation";
import { WorldShape } from "chamfer/world";

const DEPTH = 10;
const FINE_LEVEL = 5;
const SEED = seedFromString("chamfer");
const RELIEF = 1100; // the shipped default

const map = buildCoarseMap(SEED, { level: 7, relief: RELIEF });
const shape = new WorldShape(1700, DEPTH, RELIEF, 1232);

function snapped(shapeAt: WorldShape, groundRadius: number, grid: number): number {
	return Math.round(groundRadius / grid) * grid;
}

/** Every rim cell of a fine chunk, and the coarse apron cell each maps to. */
function boundaryPairs(fine: ChunkAddress, lod: number) {
	const m = 1 << (DEPTH - fine.path.length);
	const coarseLevel = fine.path.length - lod;
	const coarseDepth = DEPTH - lod;
	const out: { fine: { i: number; j: number }; coarse: { i: number; j: number } }[] =
		[];
	for (let q = 0; q <= m; q++)
		for (let r = 0; q + r <= m; r++) {
			if (q > 0 && r > 0 && q + r < m) continue;
			const [i, j] = joinPath(fine.path, q, r, DEPTH);
			const coarse = coarseCell({ face: fine.face, i, j, layer: 0 }, DEPTH, lod);
			out.push({ fine: { i, j }, coarse: { i: coarse.i, j: coarse.j } });
		}
	void coarseLevel;
	void coarseDepth;
	return out;
}

for (const [faceP, pathP, lod] of [
	[3, [1, 2, 0, 3, 1], 1],
	[3, [1, 2, 0, 3, 1], 2],
	[7, [2, 1, 3, 0, 2], 1],
	[7, [2, 1, 3, 0, 2], 2],
	[11, [0, 0, 1, 2, 3], 1],
] as [number, number[], number][]) {
	const fine = new ChunkAddress(faceP, pathP);
	const fineShape = shape.atLod(0);
	const coarseShape = shape.atLod(lod);
	const fineTerrain = new TerrainGenerator(SEED, fineShape, map);
	const coarseTerrain = new TerrainGenerator(SEED, coarseShape, map);
	const grid = shape.blockSize; // surfaceGrid is always the finest

	let worst = 0;
	let worstAt = "";
	let over1block = 0;
	let total = 0;
	for (const pair of boundaryPairs(fine, lod)) {
		const fCol = fineTerrain.columnAt(faceP, pair.fine.i, pair.fine.j);
		if (fCol.groundRadius <= 0) continue;
		const cCol = coarseTerrain.columnAt(faceP, pair.coarse.i, pair.coarse.j);
		if (cCol.groundRadius <= 0) continue;
		const fTop = snapped(fineShape, fCol.groundRadius, grid);
		const cTop = snapped(coarseShape, cCol.groundRadius, grid);
		const diff = Math.abs(fTop - cTop);
		total++;
		if (diff > shape.blockSize) over1block++;
		if (diff > worst) {
			worst = diff;
			worstAt = `${pair.fine.i}:${pair.fine.j} vs coarse ${pair.coarse.i}:${pair.coarse.j}`;
		}
	}
	console.log(
		`face ${faceP} path ${pathP.join("")} lod ${lod}: worst mismatch ${worst.toFixed(2)} m ` +
			`(apron drop is 0.01 m), ${over1block}/${total} boundary cells exceed one block (${shape.blockSize} m). ` +
			`worst at ${worstAt}`,
	);
}
