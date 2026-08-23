// Seed-vs-patched probe 1.
//
// `chunk.surface` (ground/water radius per slot) is written by generateChunk
// and NEVER touched by applyDeltas. meshChunk derives `groundCap` and the
// lifted `groundTop` from it, then reads the blocks -- which ARE patched.
// Measure what that costs once a player builds on the ground.
import {
	BlockType,
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import { applyDeltas } from "chamfer/generation";
import { DeltaStore, packBlockState } from "chamfer/edit";
import { meshChunk } from "chamfer/mesh";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { Vec3 } from "chamfer/math";
import { cellCorners, joinPath, latticePosition } from "chamfer/addressing";
import { ChunkDeltas } from "chamfer/edit";

const DEPTH = 10;
const CHUNK_LEVEL = 4;
const LOD = 2;

const seed = seedFromString("chamfer");
const map = buildCoarseMap(seed, { level: 6, cellMetres: 100, relief: 300 });
const fine = new WorldShape(1700, DEPTH, 300, maxCrustDepth(DEPTH));
const shape = fine.atLod(LOD);
const coarseLevel = CHUNK_LEVEL - LOD;

function snapped(crustTop: number, radius: number, grid: number) {
	return crustTop - Math.ceil((crustTop - radius) / grid - 1e-9) * grid;
}

// Find a land cell inside some coarse chunk whose snapped surface is lifted
// off its own coarse layer top -- the LOD merge lift.
const terrain = new TerrainGenerator(seed, shape, map);
const n = 1 << shape.subdivisionDepth;
let target: {
	key: number;
	i: number;
	j: number;
	q: number;
	r: number;
	cap: number;
	lift: number;
} | null = null;

outer: for (let key = 0; key < 20 * 4 ** coarseLevel; key++) {
	const address = ChunkAddress.fromKey(key, coarseLevel);
	const m = 1 << (shape.subdivisionDepth - coarseLevel);
	for (let q = 2; q <= m - 2 && !target; q++)
		for (let r = 2; q + r <= m - 2; r++) {
			const [i, j] = joinPath(address.path, q, r, shape.subdivisionDepth);
			const column = terrain.columnAt(address.face, i, j);
			if (column.groundRadius <= shape.seaLevelRadius + 20) continue;
			const cap = shape.layerOfSurface(column.groundRadius);
			const top = snapped(
				shape.crustTopRadius,
				column.groundRadius,
				fine.blockSize,
			);
			const lift = top - shape.radiusOfLayer(cap);
			if (lift > fine.blockSize * 2) {
				target = { key, i, j, q, r, cap, lift };
				break outer;
			}
		}
}
if (!target) throw new Error("no lifted land cell found");

console.log(`fine block ${fine.blockSize.toFixed(3)} m`);
console.log(
	`coarse block ${shape.blockSize.toFixed(3)} m  (lod ${LOD}, chunk level ${coarseLevel})`,
);
console.log(
	`target: chunk ${target.key} cell (${target.i},${target.j}) coarse groundCap ${target.cap}`,
);
console.log(
	`  radiusOfLayer(cap)      ${shape.radiusOfLayer(target.cap).toFixed(4)}`,
);
console.log(
	`  snapped groundTop       ${(shape.radiusOfLayer(target.cap) + target.lift).toFixed(4)}`,
);
console.log(`  LIFT                    ${target.lift.toFixed(4)} m`);

// The fine cell and fine layer that land in coarse cell / coarse layer cap-1.
// coarseCell scales (i,j) by 2^lod and the layer by 2^lod.
const fineI = target.i * 2 ** LOD;
const fineJ = target.j * 2 ** LOD;
const fineLayer = (target.cap - 1) * 2 ** LOD;

const address = ChunkAddress.fromKey(target.key, coarseLevel);
const cell = {
	face: address.face,
	i: fineI,
	j: fineJ,
	layer: fineLayer,
};

const store = new DeltaStore({
	version: 1,
	subdivisionDepth: DEPTH,
	chunkLevel: CHUNK_LEVEL,
	registry: [],
});
store.write(cell, packBlockState(BlockType.SNOW));

const rows = store.rowsUnder(target.key, coarseLevel).map((row) => ({
	chunkKey: row.chunkKey,
	deltas: row.deltas,
}));
console.log(`rows handed to the coarse chunk: ${rows.length}`);

function radiiAt(withEdit: boolean): { radii: number[]; blocks: number[] } {
	const chunk = generateChunk(
		terrain,
		address,
		coarseLevel,
		shape.crustDepth,
	);
	const outside = withEdit
		? applyDeltas(chunk, rows, DEPTH, LOD)
		: null;
	const sampler = new ChunkColumnSampler(chunk, terrain, outside);
	const [oi, oj] = joinPath(address.path, 0, 0, shape.subdivisionDepth);
	const origin = latticePosition(address.face, n, oi, oj).scale(
		shape.seaLevelRadius,
	);
	const corners = cellCorners(address.face, n, target!.i, target!.j);
	const wanted = corners.map((c) => new Vec3(c.x, c.y, c.z).normalize());
	const radii: number[] = [];
	const sink = {
		vertex(x: number, y: number, z: number) {
			const p = new Vec3(x + origin.x, y + origin.y, z + origin.z);
			const dir = p.normalize();
			for (const w of wanted)
				if (Math.abs(dir.dot(w) - 1) < 1e-12) {
					radii.push(p.length());
					break;
				}
			return radii.length;
		},
		triangle() {},
	};
	meshChunk(chunk, sampler, shape, seed, origin, sink, sink, {
		apron: false,
		surfaceGrid: fine.blockSize,
		speckle: 0,
	});
	const col = sampler.columnAt(address.face, target!.i, target!.j);
	return {
		radii: [...new Set(radii.map((r) => Number(r.toFixed(4))))].sort(
			(a, b) => b - a,
		),
		blocks: [...col.blocks.slice(0, target!.cap + 3)],
	};
}

const before = radiiAt(false);
const after = radiiAt(true);
console.log("\ncolumn blocks 0..cap+2");
console.log("  before:", before.blocks.join(","));
console.log("  after :", after.blocks.join(","));
console.log("\ndistinct radii drawn at that cell");
console.log("  before:", before.radii.join("  "));
console.log("  after :", after.radii.join("  "));
console.log(
	`\ncoarse layer tops: cap-1 ${shape.radiusOfLayer(target.cap - 1).toFixed(4)}  cap ${shape.radiusOfLayer(target.cap).toFixed(4)}  cap+1 ${shape.radiusOfLayer(target.cap + 1).toFixed(4)}`,
);
void ChunkDeltas;
