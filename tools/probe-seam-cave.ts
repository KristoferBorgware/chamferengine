/**
 * How much of a level join is still open once a column is hollow.
 *
 * `probe-seam-crack.ts` measures the **surface** band at a join -- the step
 * between two levels' ground -- which the apron and its curtain close. This
 * measures what is left underneath: a cell at the outer edge of a chunk's apron
 * whose column is air where the chunk over there has rock, or rock where it has
 * air. A wall belongs to the more opaque side, and neither side draws one --
 * the fine chunk compares against its own reading of the cell beyond, which is
 * not what a coarser neighbour draws, and the coarse chunk draws nothing at
 * this resolution at all. So the boundary plane stands open and a look along a
 * cave goes into the planet and out the far side of it.
 *
 * A disagreement is counted only where the coarse neighbour is the one drawing
 * the ground over there, and the segment test asks BOTH meshes -- the fine
 * chunk's and the coarse neighbour's own -- because a hole is only a hole when
 * neither of them covers it.
 *
 *   npx vite-node tools/probe-seam-cave.ts
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
import type { TerrainOptions } from "chamfer/generation";
import { Vec3 } from "chamfer/math";
import { buildChunkMesh } from "chamfer/mesh";
import { WorldShape } from "chamfer/world";

const DEPTH = 10;
const FINEST = 6;
const RADIUS = 1700;
const RELIEF = 1100;
const CRUST = 1232;
const SEED = seedFromString("chamfer");

/** The panel's own cave and cliff settings, which is the world this is about. */
const TERRAIN: TerrainOptions = {
	carveLayer: true,
	caves: true,
	caveVary: 10,
	caveRare: 0.5,
};

const map = buildCoarseMap(SEED, { level: 7, relief: RELIEF });
const shape = new WorldShape(RADIUS, DEPTH, RELIEF, CRUST);
const peaks = new ChunkPeaks(map, shape.blockSize, FINEST);
const byLod = new Map<number, TerrainGenerator>();
const terrain = (lod: number): TerrainGenerator => {
	const had = byLod.get(lod);
	if (had) return had;
	const made = new TerrainGenerator(SEED, shape.atLod(lod), map, TERRAIN);
	byLod.set(lod, made);
	return made;
};

interface Cell {
	face: number;
	i: number;
	j: number;
}

function inTriangle(
	path: readonly number[],
	depth: number,
	cell: Cell,
): boolean {
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
				apron.set(
					id(canonicalCell(nb.face, n, nb.i, nb.j)),
					canonicalCell(nb.face, n, nb.i, nb.j),
				);
			}
		}
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
			apron.set(
				id(canonicalCell(nb.face, n, nb.i, nb.j)),
				canonicalCell(nb.face, n, nb.i, nb.j),
			);
		}
	}
	for (const key of apron.keys()) if (own.has(key)) apron.delete(key);
	return { own, apron };
}

/** A built chunk and everything read off it, kept because joins share them. */
interface Built {
	sampler: ChunkColumnSampler;
	tris: Float64Array;
	layers: number;
}
const builtAt = new Map<string, Built>();
function build(key: number, chunkLevel: number, lod: number): Built {
	const name = `${chunkLevel}:${key}`;
	const had = builtAt.get(name);
	if (had) return had;
	const at = shape.atLod(lod);
	const chunk = generateChunk(
		terrain(lod),
		ChunkAddress.fromKey(key, chunkLevel),
		chunkLevel,
		at.crustDepth,
	);
	const sampler = new ChunkColumnSampler(chunk, terrain(lod));
	const mesh = buildChunkMesh(chunk, sampler, at, SEED, {
		apron: true,
		surfaceGrid: shape.blockSize,
	});
	const out: number[] = [];
	for (const part of [mesh.opaque, mesh.translucent])
		for (const index of part.indices)
			out.push(
				part.vertices[index * 6]! + mesh.origin.x,
				part.vertices[index * 6 + 1]! + mesh.origin.y,
				part.vertices[index * 6 + 2]! + mesh.origin.z,
			);
	const made: Built = {
		sampler,
		tris: new Float64Array(out),
		layers: at.crustDepth,
	};
	builtAt.set(name, made);
	return made;
}

/** Whether a short segment meets any triangle. Moller-Trumbore. */
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

function latticeAt(lod: number, cell: Cell): Vec3 {
	return latticePosition(cell.face, 1 << (DEPTH - lod), cell.i, cell.j);
}

let edges = 0;
let differ = 0;
let mouths = 0;
let mouthsBare = 0;
let backs = 0;
let backsBare = 0;
let holedEdges = 0;
let mouthsFineRock = 0;
let backsFineRock = 0;
let sameEdges = 0;
let sameWalled = 0;
let sameOpen = 0;
let deepest = 0;
let inCaveBand = 0;
let atFloor = 0;

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
	const seat = new Map<string, { lod: number; level: number; key: number }>();
	for (const c of chosen)
		seat.set(`${c.chunkLevel}:${c.key}`, {
			lod: c.lod,
			level: c.chunkLevel,
			key: c.key,
		});
	const seatOf = (cell: Cell) => {
		for (let level = 0; level <= FINEST; level++) {
			const split = splitPath(cell.i, cell.j, DEPTH, level);
			const key = new ChunkAddress(cell.face, split.path).key;
			const got = seat.get(`${level}:${key}`);
			if (got) return got;
		}
		return null;
	};

	for (const sel of chosen) {
		const address = ChunkAddress.fromKey(sel.key, sel.chunkLevel);
		const depth = DEPTH - sel.lod;
		const n = 1 << depth;
		const { own, apron } = drawn(address, depth);
		const mine = build(sel.key, sel.chunkLevel, sel.lod);
		const at = shape.atLod(sel.lod);

		for (const cell of apron.values()) {
			const degree = degreeOf(n, cell.i, cell.j);
			const column = mine.sampler.columnAt(cell.face, cell.i, cell.j);
			for (let k = 0; k < degree; k++) {
				const nb = neighbour(cell.face, n, cell.i, cell.j, k);
				if (!nb) continue;
				const canon = canonicalCell(nb.face, n, nb.i, nb.j);
				if (own.has(`${canon.face}:${canon.i}:${canon.j}`)) continue;
				if (apron.has(`${canon.face}:${canon.i}:${canon.j}`)) continue;
				const there = seatOf({
					face: canon.face,
					i: canon.i << sel.lod,
					j: canon.j << sel.lod,
				});
				if (!there) continue;
				if (there.lod <= sel.lod) {
					// A boundary onto a chunk at this one's own level. A rule
					// gated on the COARSE reading would fire here too, and
					// this is where a spurious wall would stand in the open.
					if (there.lod < sel.lod) continue;
					const coarseSame = shape.atLod(sel.lod + 1);
					const overSame = coarseCell(
						{ face: canon.face, i: canon.i, j: canon.j, layer: 0 },
						depth,
						1,
					);
					const sameFine = mine.sampler.columnAt(
						canon.face,
						canon.i,
						canon.j,
					);
					const sameCoarse = terrain(sel.lod + 1);
					const scratch = new Uint16Array(coarseSame.crustDepth);
					sameCoarse.fillColumn(
						sameCoarse.columnAt(
							overSame.face,
							overSame.i << 0,
							overSame.j << 0,
						),
						scratch,
						0,
						coarseSame.crustDepth,
					);
					sameEdges++;
					for (let y = 0; y < mine.layers; y++) {
						const midR =
							at.radiusOfLayer(y) - at.blockSize / 2;
						const here = (column.blocks[y] ?? 0) !== 0;
						const cl2 = coarseSame.layerOfRadius(midR);
						const coarseRock =
							cl2 >= 0 &&
							cl2 < coarseSame.crustDepth &&
							(scratch[cl2] ?? 0) !== 0;
						const fineRock2 = (sameFine.blocks[y] ?? 0) !== 0;
						if (here || !coarseRock) continue;
						// The coarse gate would emit here. Safe only where the
						// real neighbour has rock to bury it in.
						if (fineRock2) sameWalled++;
						else sameOpen++;
					}
					continue;
				}
				edges++;

				const step = there.lod - sel.lod;
				const coarseAt = shape.atLod(there.lod);
				const theirs = build(there.key, there.level, there.lod);
				const over = coarseCell(
					{ face: canon.face, i: canon.i, j: canon.j, layer: 0 },
					depth,
					step,
				);
				const theirColumn = theirs.sampler.columnAt(
					over.face,
					over.i,
					over.j,
				);
				const beyondFine = mine.sampler.columnAt(
					canon.face,
					canon.i,
					canon.j,
				);

				const corners = cellCorners(cell.face, n, cell.i, cell.j);
				const left = corners[(k + degree - 1) % degree]!;
				const right = corners[k]!;
				const middle = left.add(right).normalize();
				const across = latticeAt(sel.lod, canon)
					.sub(latticeAt(sel.lod, cell))
					.normalize();
				const ground = column.groundRadius;
				// **Under both sides' drawn ground, and no higher.** A coarse
				// chunk's blocks are on its own doubled layer grid while its
				// cap is drawn on the shared fine one, so its topmost block
				// starts up to a coarse layer below the surface it draws --
				// and comparing block arrays across that reports a hole in a
				// sliver no eye can be inside. The surface band is
				// `probe-seam-crack.ts`'s question; this one is the caves.
				const snap = (r: number) =>
					r > 0
						? shape.crustTopRadius -
							Math.ceil(
								(shape.crustTopRadius - r) / shape.blockSize -
									1e-9,
							) *
								shape.blockSize
						: 0;
				const ourCap = snap(column.groundRadius);
				const theirCap = snap(theirColumn.groundRadius);
				const roof = Math.min(ourCap, theirCap || Infinity);
				let holedHere = false;

				for (let y = 0; y < mine.layers; y++) {
					const top = at.radiusOfLayer(y);
					const mid = top - at.blockSize / 2;
					// **A level's top block reaches up to its DRAWN cap.** The
					// cap is snapped to the shared finest grid while the
					// blocks sit on that level's own doubled one, so the
					// topmost block's own top face can be a coarse layer below
					// the surface the level presents. What is between them is
					// covered by that cap and cannot be looked into; reading
					// the block array alone calls it air and reports a hole in
					// a sliver no eye can be inside.
					const solidHere =
						(column.blocks[y] ?? 0) !== 0 ||
						(y === column.first - 1 && mid <= ourCap);
					const cl = coarseAt.layerOfRadius(mid);
					const solidThere =
						cl >= 0 &&
						cl < theirs.layers &&
						((theirColumn.blocks[cl] ?? 0) !== 0 ||
							(cl === theirColumn.first - 1 &&
								mid <= theirCap));
					if (solidHere === solidThere) continue;
					if (!(mid < roof - 1e-9)) continue;
					differ++;
					if (solidThere) mouths++;
					else backs++;
					const from = middle
						.scale(mid)
						.sub(across.scale(at.blockSize));
					const blocked =
						crosses(from, across, mine.tris, 2 * at.blockSize) ||
						crosses(from, across, theirs.tris, 2 * at.blockSize);
					const fineRock = (beyondFine.blocks[y] ?? 0) !== 0;
					if (!blocked) {
						if (solidThere) {
							mouthsBare++;
							if (fineRock) mouthsFineRock++;
						} else {
							backsBare++;
							if (fineRock) backsFineRock++;
						}
						holedHere = true;
						const under = (ground > 0 ? ground : at.radiusOfLayer(0)) - mid;
						if (under > deepest) deepest = under;
						if (under <= 40) inCaveBand++;
						if (y >= mine.layers - 2) atFloor++;
					}
				}
				if (holedHere) holedEdges++;
			}
		}
	}
}

console.log(
	`${edges} apron outer edges at a level join, over three altitudes, ` +
		`with caves and cliffs on.`,
);
console.log(
	`${differ} block boundaries where the two sides disagree about solidity.`,
);
console.log(
	`  ${mouths} rock facing this chunk's void (a cave mouth): ` +
		`${mouthsBare} with nothing drawn across ` +
		`(${((100 * mouthsBare) / Math.max(1, mouths)).toFixed(1)}%).`,
);
console.log(
	`  ${backs} this chunk's rock facing their void: ` +
		`${backsBare} with nothing drawn across ` +
		`(${((100 * backsBare) / Math.max(1, backs)).toFixed(1)}%).`,
);
console.log(
	`of the open boundaries, ${mouthsFineRock} of ${mouthsBare} mouths and ` +
		`${backsFineRock} of ${backsBare} backs have rock in this chunk's own ` +
		`reading of the cell beyond.`,
);
console.log(
	`${sameEdges} outer edges onto a SAME-level chunk: a coarse-gated rule ` +
		`would emit ${sameWalled + sameOpen} walls there, ${sameWalled} buried ` +
		`in the neighbour's rock and ${sameOpen} standing in its open air.`,
);
console.log(
	`${holedEdges} of the ${edges} outer edges have at least one open boundary ` +
		`(${((100 * holedEdges) / Math.max(1, edges)).toFixed(1)}%).`,
);
console.log(
	`of the ${mouthsBare + backsBare} open boundaries, ${inCaveBand} sit within ` +
		`40 m of their own ground and ${atFloor} are on the crust floor; ` +
		`deepest is ${deepest.toFixed(1)} m under the ground.`,
);
