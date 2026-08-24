/**
 * How tall the unwalled band at the outer edge of a chunk's apron is.
 *
 * A chunk draws its own cells and one ring beyond them, and that ring is a lid:
 * up-caps, plus a wall wherever a cell in the ring stands over another cell the
 * same chunk drew. At the ring's OUTER edge there is no such cell -- what is
 * over there is the neighbouring chunk's ground, drawn at the neighbour's own
 * level of detail -- so nothing walls the drop to it. Everything between the
 * two surfaces is open, and a look along the ground goes into the planet and out
 * the far side of it.
 *
 * This measures that band, in metres, over the level joins a real selection
 * actually produces, and then builds the chunk and fires short segments across
 * the band at several heights to ask whether the mesh actually closes it. The
 * band runs from the chunk's own cap down to the coarse ground -- the whole
 * frontier face, not just the part below the neighbouring cell's own cap.
 *
 *   npx vite-node tools/probe-seam-crack.ts
 */
import {
	canonicalCell,
	cellCorners,
	joinPath,
	latticePosition,
	latticeWeights,
	neighbour,
	splitPath,
} from "chamfer/addressing";
import { coarseCell } from "chamfer/edit";
import {
	ChunkAddress,
	ChunkColumnSampler,
	ChunkPeaks,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
	selectChunks,
} from "chamfer/generation";
import { Vec3 } from "chamfer/math";
import { buildChunkMesh } from "chamfer/mesh";
import { WorldShape } from "chamfer/world";

const DEPTH = 10;
const FINEST = 6;
const RADIUS = 1700;
const RELIEF = 1100;
const CRUST = 1232;
const SEED = seedFromString("chamfer");

const map = buildCoarseMap(SEED, { level: 7, relief: RELIEF });
const shape = new WorldShape(RADIUS, DEPTH, RELIEF, CRUST);
const peaks = new ChunkPeaks(map, shape.blockSize, FINEST);
const byLod = new Map<number, TerrainGenerator>();
const terrain = (lod: number): TerrainGenerator => {
	const had = byLod.get(lod);
	if (had) return had;
	const made = new TerrainGenerator(SEED, shape.atLod(lod), map);
	byLod.set(lod, made);
	return made;
};

interface Cell {
	face: number;
	i: number;
	j: number;
}

/** The radius a level's cap is drawn at, on the shared finest grid. */
function capOf(lod: number, cell: Cell): number {
	const ground = terrain(lod).columnAt(cell.face, cell.i, cell.j).groundRadius;
	if (ground <= 0) return 0;
	return (
		shape.crustTopRadius -
		Math.ceil((shape.crustTopRadius - ground) / shape.blockSize - 1e-9) *
			shape.blockSize
	);
}

function inTriangle(path: readonly number[], depth: number, cell: Cell): boolean {
	const split = splitPath(cell.i, cell.j, depth, path.length);
	for (let level = 0; level < path.length; level++)
		if (split.path[level] !== path[level]) return false;
	return true;
}

function owns(address: ChunkAddress, depth: number, cell: Cell): boolean {
	const n = 1 << depth;
	const w = latticeWeights(n, cell.i, cell.j);
	if (w[0] === 0 || w[1] === 0 || w[2] === 0)
		if (canonicalCell(cell.face, n, cell.i, cell.j).face !== cell.face)
			return false;
	return cell.face === address.face && inTriangle(address.path, depth, cell);
}

function degreeOf(n: number, i: number, j: number): number {
	return latticeWeights(n, i, j).filter((w) => w > 0).length === 1 ? 5 : 6;
}

/** Every cell a chunk draws a cap for: the ones it owns, and the ring beyond. */
function drawn(address: ChunkAddress, depth: number) {
	const n = 1 << depth;
	const m = 1 << (depth - address.path.length);
	const own = new Set<string>();
	const apron = new Map<string, Cell>();
	const id = (c: Cell) => `${c.face}:${c.i}:${c.j}`;

	for (let q = 0; q <= m; q++)
		for (let r = 0; q + r <= m; r++) {
			const [i, j] = joinPath(address.path, q, r, depth);
			const cell = { face: address.face, i, j };
			if (!owns(address, depth, cell)) continue;
			own.add(id(cell));
			const degree = degreeOf(n, i, j);
			for (let k = 0; k < degree; k++) {
				const nb = neighbour(address.face, n, i, j, k);
				if (!nb) continue;
				if (owns(address, depth, nb)) continue;
				const canon = canonicalCell(nb.face, n, nb.i, nb.j);
				apron.set(id(canon), canon);
			}
		}
	// The three corners of the triangle and their full rings, which the
	// mesher adds outright: a cell clipping the corner wedge can sit two steps
	// from every owned cell, so the walk along the rim never reaches it.
	for (const [cq, cr] of [
		[0, 0],
		[m, 0],
		[0, m],
	] as const) {
		const [ci, cj] = joinPath(address.path, cq, cr, depth);
		const corner = canonicalCell(address.face, n, ci, cj);
		apron.set(id(corner), corner);
		for (let k = 0; k < degreeOf(n, corner.i, corner.j); k++) {
			const nb = neighbour(corner.face, n, corner.i, corner.j, k);
			if (!nb) continue;
			const canon = canonicalCell(nb.face, n, nb.i, nb.j);
			apron.set(id(canon), canon);
		}
	}
	for (const key of apron.keys()) if (own.has(key)) apron.delete(key);
	return { own, apron };
}

/** Every triangle a chunk draws, in world space. */
const meshes = new Map<string, Float64Array>();
function trianglesOf(key: number, chunkLevel: number, lod: number): Float64Array {
	const name = `${chunkLevel}:${key}`;
	const had = meshes.get(name);
	if (had) return had;
	const at = shape.atLod(lod);
	const built = generateChunk(
		terrain(lod),
		ChunkAddress.fromKey(key, chunkLevel),
		chunkLevel,
		at.crustDepth,
	);
	const mesh = buildChunkMesh(
		built,
		new ChunkColumnSampler(built, terrain(lod)),
		at,
		SEED,
		{ apron: true, surfaceGrid: shape.blockSize },
	);
	const out: number[] = [];
	for (const part of [mesh.opaque, mesh.translucent])
		for (const index of part.indices)
			out.push(
				part.vertices[index * 6]! + mesh.origin.x,
				part.vertices[index * 6 + 1]! + mesh.origin.y,
				part.vertices[index * 6 + 2]! + mesh.origin.z,
			);
	const packed = new Float64Array(out);
	meshes.set(name, packed);
	return packed;
}

/** Whether a short segment meets any triangle. Möller-Trumbore. */
function crosses(o: Vec3, d: Vec3, tris: Float64Array, limit: number): boolean {
	for (let t = 0; t + 8 < tris.length; t += 9) {
		const ax = tris[t]!;
		const ay = tris[t + 1]!;
		const az = tris[t + 2]!;
		const e1x = tris[t + 3]! - ax;
		const e1y = tris[t + 4]! - ay;
		const e1z = tris[t + 5]! - az;
		const e2x = tris[t + 6]! - ax;
		const e2y = tris[t + 7]! - ay;
		const e2z = tris[t + 8]! - az;
		const px = d.y * e2z - d.z * e2y;
		const py = d.z * e2x - d.x * e2z;
		const pz = d.x * e2y - d.y * e2x;
		const det = e1x * px + e1y * py + e1z * pz;
		if (det > -1e-12 && det < 1e-12) continue;
		const inv = 1 / det;
		const tx = o.x - ax;
		const ty = o.y - ay;
		const tz = o.z - az;
		const u = (tx * px + ty * py + tz * pz) * inv;
		if (u < 0 || u > 1) continue;
		const qx = ty * e1z - tz * e1y;
		const qy = tz * e1x - tx * e1z;
		const qz = tx * e1y - ty * e1x;
		const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
		if (v < 0 || u + v > 1) continue;
		const hit = (e2x * qx + e2y * qy + e2z * qz) * inv;
		if (hit > 0 && hit < limit) return true;
	}
	return false;
}

/** Where a cell's own lattice point sits, as a unit direction. */
function latticeAt(lod: number, cell: Cell): Vec3 {
	return latticePosition(cell.face, 1 << (DEPTH - lod), cell.i, cell.j);
}

let edges = 0;
let open = 0;
let bare = 0;
let worst = 0;
let overBlock = 0;
let sum = 0;

const dir = { x: 0.31, y: 0.72, z: 0.62 };
const len = Math.hypot(dir.x, dir.y, dir.z);
const viewer = { x: dir.x / len, y: dir.y / len, z: dir.z / len };

for (const altitude of [2, 60, 600]) {
	const chosen = selectChunks(
		DEPTH,
		FINEST,
		viewer,
		RADIUS + altitude,
		RADIUS,
		2,
		RELIEF,
		peaks,
	);
	// Only the joins: a chunk with a coarser chunk somewhere against it.
	const lodAt = new Map<string, number>();
	for (const c of chosen) lodAt.set(`${c.chunkLevel}:${c.key}`, c.lod);
	const lodOf = (cell: Cell): number | null => {
		for (let level = 0; level <= FINEST; level++) {
			const split = splitPath(cell.i, cell.j, DEPTH, level);
			const key = new ChunkAddress(cell.face, split.path).key;
			const got = lodAt.get(`${level}:${key}`);
			if (got !== undefined) return got;
		}
		return null;
	};

	for (const sel of chosen.slice(0, 60)) {
		const address = ChunkAddress.fromKey(sel.key, sel.chunkLevel);
		const depth = DEPTH - sel.lod;
		const { own, apron } = drawn(address, depth);
		const n = 1 << depth;

		for (const cell of apron.values()) {
			const degree = degreeOf(n, cell.i, cell.j);
			const mine = capOf(sel.lod, cell);
			if (mine <= 0) continue;
			for (let k = 0; k < degree; k++) {
				const nb = neighbour(cell.face, n, cell.i, cell.j, k);
				if (!nb) continue;
				const canon = canonicalCell(nb.face, n, nb.i, nb.j);
				const key = `${canon.face}:${canon.i}:${canon.j}`;
				// An edge onto a cell this chunk also draws is walled by the
				// ordinary cap step. Only the ring's outer edge is bare.
				if (own.has(key) || apron.has(key)) continue;

				// Whose ground is over there, and at which level it is drawn.
				// At the finest lattice the neighbour's cell IS this one; a
				// coarser chunk draws the coarse cell this one falls into.
				const fine = joinPath(
					splitPath(canon.i, canon.j, depth, 0).path,
					canon.i << sel.lod,
					canon.j << sel.lod,
					DEPTH,
				);
				void fine;
				const theirLod = lodOf({
					face: canon.face,
					i: canon.i << sel.lod,
					j: canon.j << sel.lod,
				});
				if (theirLod === null || theirLod <= sel.lod) continue;

				const step = theirLod - sel.lod;
				const there = coarseCell(
					{ face: canon.face, i: canon.i, j: canon.j, layer: 0 },
					depth,
					step,
				);
				const theirs = capOf(theirLod, there);
				if (theirs <= 0) continue;

				// The band this chunk's own geometry must close at that
				// edge: from its own cap all the way down to the ground the
				// coarser level draws. Not from the LOWER of the two own-level
				// caps -- measuring from there is how the step walls between
				// two fine cells across the boundary went unmeasured, and
				// they are most of what a hillside shows.
				const band = mine - theirs;
				edges++;
				if (band <= 1e-6) continue;
				open++;
				sum += band;
				if (band > shape.blockSize) overBlock++;
				if (band > worst) worst = band;

				// Is anything actually drawn across it? A wall there stands
				// on the edge shared with the cell beyond, which runs between
				// corners `k - 1` and `k`, so short segments through the band
				// crossing that edge meet it if it exists -- at several
				// heights, because the band can be closed by different pieces
				// at different depths and a single mid-height probe misses a
				// hole above or below it.
				const corners = cellCorners(cell.face, n, cell.i, cell.j);
				const left = corners[(k + degree - 1) % degree]!;
				const right = corners[k]!;
				const middle = left.add(right).normalize();
				const across = latticeAt(sel.lod, canon)
					.sub(latticeAt(sel.lod, cell))
					.normalize();
				const tris = trianglesOf(sel.key, sel.chunkLevel, sel.lod);
				let holed = false;
				for (const f of [0.15, 0.4, 0.65, 0.9]) {
					const mid = middle.scale(theirs + band * f);
					const from = mid.sub(across.scale(shape.blockSize));
					if (!crosses(from, across, tris, 2 * shape.blockSize)) {
						holed = true;
						break;
					}
				}
				if (holed) bare++;
			}
		}
	}
}

console.log(
	`${edges} apron outer edges at a level join, over three altitudes.`,
);
console.log(
	`${open} of them stand over the neighbour's ground with nothing between ` +
		`(${((100 * open) / Math.max(1, edges)).toFixed(1)}%).`,
);
console.log(
	`${bare} of those ${open} have nothing drawn across the middle of the ` +
		`band (${((100 * bare) / Math.max(1, open)).toFixed(1)}%).`,
);
console.log(
	`open band: ${(sum / Math.max(1, open)).toFixed(2)} m mean, ` +
		`${worst.toFixed(2)} m worst, ${overBlock} taller than one ` +
		`${shape.blockSize.toFixed(2)} m block.`,
);
