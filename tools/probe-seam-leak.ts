/**
 * Whether a look along the ground can pass through a level join and out of the
 * planet.
 *
 * Builds every chunk a real selection puts around a level join, takes every
 * triangle all of them emit, and fires rays outward from inside the crust under
 * the seam at grazing angles. A ray that starts in solid rock and stands clear
 * of the ground without having crossed a single triangle has found a hole.
 *
 * Three things keep it honest. The ray starts under the **lowest** surface any
 * of the levels around it draws, so it never begins in the air. Every chunk
 * within reach of the ray is built, not just the two at the join, so a ray
 * cannot escape through ground nobody meshed. And a ray whose exit point is
 * over a chunk outside that set is discarded rather than counted.
 *
 * This is the mesh, not the terrain: `probe-seam-crack.ts` measures the band
 * the mesher is being asked to close, and this measures whether it closed it.
 *
 *   npx vite-node tools/probe-seam-leak.ts
 */
import { neighbour, positionToCell, splitPath } from "chamfer/addressing";
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
const FINEST = 4;
const RADIUS = 1700;
const RELIEF = 1100;
const CRUST = 1232;
const SEED = seedFromString("chamfer");

/** How far under the lowest surface around it a ray starts, in metres. */
const DEEP = 8;

/** How far over the ground a ray has to stand to have got out, in metres. */
const CLEAR = 4;

/** How far a ray is followed before it has answered nothing, in metres. */
const RUN = 180;

/** How wide a patch of chunks is built around each join, in radians. */
const AROUND = 0.12;

/** Whether to sample the level joins, or the ground away from them. */
const WANT_JOIN = process.argv[2] !== "interior";

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

interface Chosen {
	readonly lod: number;
	readonly chunkLevel: number;
	readonly key: number;
}

/** Every triangle one chunk draws, in world space. */
const meshes = new Map<string, Float64Array>();
function trianglesOf(chunk: Chosen): Float64Array {
	const name = `${chunk.chunkLevel}:${chunk.key}`;
	const had = meshes.get(name);
	if (had) return had;
	const at = shape.atLod(chunk.lod);
	const built = generateChunk(
		terrain(chunk.lod),
		ChunkAddress.fromKey(chunk.key, chunk.chunkLevel),
		chunk.chunkLevel,
		at.crustDepth,
	);
	const mesh = buildChunkMesh(
		built,
		new ChunkColumnSampler(built, terrain(chunk.lod)),
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

/** Möller-Trumbore against a packed triangle soup: is there any hit at all? */
function hits(
	origin: Vec3,
	d: Vec3,
	tris: Float64Array,
	limit: number,
): boolean {
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
		const tx = origin.x - ax;
		const ty = origin.y - ay;
		const tz = origin.z - az;
		const u = (tx * px + ty * py + tz * pz) * inv;
		if (u < 0 || u > 1) continue;
		const qx = ty * e1z - tz * e1y;
		const qy = tz * e1x - tx * e1z;
		const qz = tx * e1y - ty * e1x;
		const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
		if (v < 0 || u + v > 1) continue;
		const hit = (e2x * qx + e2y * qy + e2z * qz) * inv;
		if (hit > 1e-6 && hit < limit) return true;
	}
	return false;
}

/** Two unit directions across a third, to swing an azimuth in. */
function across(up: Vec3): [Vec3, Vec3] {
	const helper = Math.abs(up.x) < 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
	const e = up.cross(helper).normalize();
	return [e, up.cross(e)];
}

const viewer = new Vec3(0.31, 0.72, 0.62).normalize();

let joins = 0;
let rays = 0;
let leaks = 0;
let worst = 0;
const examples: string[] = [];

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
	const lodAt = new Map<string, Chosen>();
	for (const c of chosen) lodAt.set(`${c.chunkLevel}:${c.key}`, c);
	const chunkOf = (face: number, i: number, j: number): Chosen | null => {
		for (let level = 0; level <= FINEST; level++) {
			const split = splitPath(i, j, DEPTH, level);
			const key = new ChunkAddress(face, split.path).key;
			const got = lodAt.get(`${level}:${key}`);
			if (got) return got;
		}
		return null;
	};
	const n = 1 << DEPTH;
	const chunkAlong = (p: Vec3): Chosen | null => {
		const cell = positionToCell(p, n);
		return chunkOf(cell.face, cell.i, cell.j);
	};

	const seen = new Set<string>();
	const [e, f] = across(viewer);
	for (let t = 0; t < 3000 && joins < 24; t++) {
		// A golden-angle spiral over the ground in view, so the sample is of
		// the joins a real selection makes rather than of one of them.
		const spread = 0.7 * Math.sqrt((t + 0.5) / 3000);
		const angle = t * 2.39996;
		const side = e.scale(Math.cos(angle)).add(f.scale(Math.sin(angle)));
		const at = viewer
			.scale(Math.cos(spread))
			.add(side.scale(Math.sin(spread)))
			.normalize();
		const cell = positionToCell(at, n);
		const mine = chunkOf(cell.face, cell.i, cell.j);
		if (!mine) continue;

		let join: Chosen | null = null;
		for (let k = 0; k < 6 && !join; k++) {
			const nb = neighbour(cell.face, n, cell.i, cell.j, k);
			if (!nb) continue;
			const theirs = chunkOf(nb.face, nb.i, nb.j);
			if (theirs && theirs.lod !== mine.lod) join = theirs;
		}
		if (WANT_JOIN ? !join : join) continue;
		const name = `${mine.chunkLevel}:${mine.key}>${join ? `${join.chunkLevel}:${join.key}` : "same"}`;
		if (seen.has(name)) continue;
		seen.add(name);
		joins++;

		// Every chunk a ray from here could reach, built. A hole is only a
		// hole if the ground it slipped through was actually drawn.
		const local = new Map<string, Chosen>();
		const [ne, nf] = across(at);
		for (let s = 0; s <= 6; s++)
			for (let a = 0; a < 24; a++) {
				const spin = (a / 24) * 2 * Math.PI;
				const wide = Math.sin((s / 6) * AROUND);
				const p = at
					.scale(Math.cos((s / 6) * AROUND))
					.add(
						ne
							.scale(Math.cos(spin))
							.add(nf.scale(Math.sin(spin)))
							.scale(wide),
					);
				const got = chunkAlong(p.normalize());
				if (got) local.set(`${got.chunkLevel}:${got.key}`, got);
			}
		let size = 0;
		for (const chunk of local.values()) size += trianglesOf(chunk).length;
		const tris = new Float64Array(size);
		let write = 0;
		for (const chunk of local.values()) {
			const part = trianglesOf(chunk);
			tris.set(part, write);
			write += part.length;
		}

		// The lowest surface any level around here draws, so the ray starts
		// under all of them rather than in the air over the coarsest.
		let floor = Infinity;
		for (const chunk of local.values()) {
			const coarse = coarseCell(
				{ face: cell.face, i: cell.i, j: cell.j, layer: 0 },
				DEPTH,
				chunk.lod,
			);
			const ground = terrain(chunk.lod).columnAt(
				coarse.face,
				coarse.i,
				coarse.j,
			).groundRadius;
			if (ground > 0 && ground < floor) floor = ground;
		}
		if (!Number.isFinite(floor)) continue;

		const origin = at.scale(floor - DEEP);

		// The drawn surface under a point, at whichever level draws it there.
		const groundUnder = (p: Vec3): number => {
			const c = positionToCell(p, n);
			const chunk = chunkOf(c.face, c.i, c.j);
			if (!chunk) return Infinity;
			const coarse = coarseCell(
				{ face: c.face, i: c.i, j: c.j, layer: 0 },
				DEPTH,
				chunk.lod,
			);
			return terrain(chunk.lod).columnAt(coarse.face, coarse.i, coarse.j)
				.groundRadius;
		};
		let fired = 0;
		let leaked = 0;
		for (let a = 0; a < 24; a++) {
			const spin = (a / 24) * 2 * Math.PI;
			const sideways = ne
				.scale(Math.cos(spin))
				.add(nf.scale(Math.sin(spin)));
			for (const tilt of [16, 24, 34, 45, 60]) {
				const rad = (tilt * Math.PI) / 180;
				const d = at
					.scale(Math.sin(rad))
					.add(sideways.scale(Math.cos(rad)))
					.normalize();
				// Where it first stands clear of the ground under it. A ray
				// still inside the rock at the end of its run has answered
				// nothing -- it was never going to meet a surface -- so it is
				// discarded rather than counted as an escape.
				let exit = 0;
				for (let step = 1; step <= 40; step++) {
					const along = (step / 40) * RUN;
					const p = origin.add(d.scale(along));
					if (p.length() > groundUnder(p.normalize()) + CLEAR) {
						exit = along;
						break;
					}
				}
				if (exit === 0) continue;
				const end = origin.add(d.scale(exit));
				const over = chunkAlong(end.normalize());
				if (!over || !local.has(`${over.chunkLevel}:${over.key}`))
					continue;
				fired++;
				if (!hits(origin, d, tris, exit)) leaked++;
			}
		}
		rays += fired;
		leaks += leaked;
		if (fired > 0) worst = Math.max(worst, leaked / fired);
		if (leaked > 0 && examples.length < 5)
			examples.push(`${name}: ${leaked} of ${fired} rays escaped`);
	}
}

console.log(`${joins} ${WANT_JOIN ? "level joins" : "interior places"}, ${rays} grazing rays from inside the crust.`);
console.log(
	`${leaks} stood clear of the ground without crossing any triangle ` +
		`(${((100 * leaks) / Math.max(1, rays)).toFixed(2)}%), ` +
		`worst single join ${(100 * worst).toFixed(1)}%.`,
);
for (const line of examples) console.log(`   ${line}`);
