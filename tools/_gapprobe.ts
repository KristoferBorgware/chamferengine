// Probe C: meshChunk snaps the GROUND cap of a column to the fine grid using
// `own.groundRadius`, which applyDeltas never touches. Once a player puts a
// block ON the ground, the wall of the placed block ends at the coarse layer
// boundary while the wall of the ground below starts at the snapped surface,
// which is lower. Measure the span between them.
import {
	BlockType,
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import { ArrayMeshSink, meshChunk } from "chamfer/mesh";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { Vec3 } from "chamfer/math";
import { cellCorners, joinPath, neighbour } from "chamfer/addressing";

const DEPTH = 10;
const CHUNK_LEVEL = 4;

const map = buildCoarseMap(seedFromString("chamfer"), {
	level: 6,
	cellMetres: 100,
	relief: 100,
});
const fine = new WorldShape(1700, DEPTH, 150, maxCrustDepth(DEPTH));

function snappedSurface(crustTop: number, radius: number, grid: number) {
	return crustTop - Math.ceil((crustTop - radius) / grid - 1e-9) * grid;
}

console.log(`fine block size ${fine.blockSize.toFixed(4)} m`);
for (const lod of [0, 1, 2, 3, 4]) {
	const shape = fine.atLod(lod);
	const terrain = new TerrainGenerator(map.seed, shape, map);
	const n = 1 << shape.subdivisionDepth;
	let worst = 0;
	let sum = 0;
	let count = 0;
	let nonzero = 0;
	for (let face = 0; face < 20; face++)
		for (let i = 0; i <= n; i += Math.max(1, n >> 5))
			for (let j = 0; i + j <= n; j += Math.max(1, n >> 5)) {
				const column = terrain.columnAt(face, i, j);
				if (column.groundRadius <= shape.seaLevelRadius) continue;
				const groundCap = shape.layerOfSurface(column.groundRadius);
				const groundTop = snappedSurface(
					shape.crustTopRadius,
					column.groundRadius,
					fine.blockSize,
				);
				const gap = groundTop - shape.radiusOfLayer(groundCap);
				sum += gap;
				count++;
				if (gap > 1e-9) nonzero++;
				if (gap > worst) worst = gap;
			}
	console.log(
		`lod ${lod}: coarse layer ${shape.blockSize.toFixed(3)} m; ` +
			`over ${count} land columns the snapped ground cap stands above radiusOfLayer(groundCap) by ` +
			`ground cap is ${(sum / count).toFixed(3)} m mean, ${worst.toFixed(3)} m worst, ` +
			`non-zero on ${((100 * nonzero) / count).toFixed(1)}%`,
	);
}

// Now show that the mesher really leaves that span unwalled once a block is
// placed on the ground. Build one coarse chunk, put a block of a DIFFERENT type
// on top of one column's ground, and read the wall spans off the triangles.
console.log("\n--- one column, meshed for real ---");
const LOD = 2;
const shape = fine.atLod(LOD);
const terrain = new TerrainGenerator(map.seed, shape, map);
const LAYERS = shape.crustDepth;
let KEY = 0;
let address = ChunkAddress.fromKey(KEY, CHUNK_LEVEL);
const n = 1 << shape.subdivisionDepth;

function pick(addr: ChunkAddress, m: number) {
	for (let q = 2; q < m - 2; q++)
		for (let r = 2; q + r < m - 2; r++) {
			const [i, j] = joinPath(addr.path, q, r, shape.subdivisionDepth);
			const column = terrain.columnAt(addr.face, i, j);
			if (column.groundRadius <= shape.seaLevelRadius + 20) continue;
			const cap = shape.layerOfSurface(column.groundRadius);
			const top = snappedSurface(shape.crustTopRadius, column.groundRadius, fine.blockSize);
			if (top - shape.radiusOfLayer(cap) < fine.blockSize * 1.5) continue;
			let lower = false;
			for (let k = 0; k < 6; k++) {
				const nb = neighbour(addr.face, n, i, j, k);
				if (!nb) continue;
				const other = terrain.columnAt(nb.face, nb.i, nb.j);
				if (shape.layerOfSurface(other.groundRadius) > cap) lower = true;
			}
			if (!lower) continue;
			return { q, r, i, j };
		}
	return null;
}

function build(place: boolean) {
	const chunk = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
	// A cell well inside the triangle, on land, whose ground cap really is
	// snapped below its own coarse layer boundary, and which has a neighbour
	// standing lower so a wall exists at all.
	const picked = pick(address, chunk.m);
	const at = picked!;
	const column = terrain.columnAt(address.face, at.i, at.j);
	const groundCap = shape.layerOfSurface(column.groundRadius);
	if (place) {
		const slotBase =
			chunk.indexOf(at.q, at.r, 0) / 1; // rank * layerCount
		void slotBase;
		chunk.blocks[chunk.indexOf(at.q, at.r, groundCap - 1)] =
			BlockType.SNOW;
		// same band rule applyDeltas uses
		const base = chunk.indexOf(at.q, at.r, 0);
		let first = LAYERS;
		let last = -1;
		for (let layer = 0; layer < LAYERS; layer++) {
			const block = chunk.blocks[base + layer]!;
			if (block !== BlockType.AIR) {
				if (first === LAYERS) first = layer;
			} else last = layer;
		}
		const slot = base / LAYERS;
		chunk.band[slot * 2] = first;
		chunk.band[slot * 2 + 1] = last;
	}
	const origin = new Vec3(0, 0, 0);
	const opaque = new ArrayMeshSink(4096);
	const translucent = new ArrayMeshSink(256);
	meshChunk(
		chunk,
		new ChunkColumnSampler(chunk, terrain),
		shape,
		map.seed,
		origin,
		opaque,
		translucent,
		{ surfaceGrid: fine.blockSize, apron: false },
	);
	return { at, groundCap, column, geometry: opaque.build(0) };
}

function wallSpans(
	geometry: { vertices: Float32Array; indices: Uint32Array },
	corners: readonly Vec3[],
	k: number,
	degree: number,
) {
	const left = corners[(k + degree - 1) % degree]!;
	const right = corners[k]!;
	const spans: [number, number][] = [];
	const near = (v: Vec3, dir: Vec3) => {
		const u = v.normalize();
		return (
			Math.abs(u.x - dir.x) < 1e-7 &&
			Math.abs(u.y - dir.y) < 1e-7 &&
			Math.abs(u.z - dir.z) < 1e-7
		);
	};
	for (let t = 0; t + 2 < geometry.indices.length; t += 3) {
		const radii: number[] = [];
		let ok = true;
		for (let c = 0; c < 3; c++) {
			const v = geometry.indices[t + c]! * 6;
			const p = new Vec3(
				geometry.vertices[v]!,
				geometry.vertices[v + 1]!,
				geometry.vertices[v + 2]!,
			);
			if (!near(p, left) && !near(p, right)) {
				ok = false;
				break;
			}
			radii.push(p.length());
		}
		if (!ok) continue;
		spans.push([Math.max(...radii), Math.min(...radii)]);
	}
	spans.sort((a, b) => b[0] - a[0]);
	return spans;
}

for (let k = 0; k < 20 * 4 ** CHUNK_LEVEL; k++) {
	const a = ChunkAddress.fromKey(k, CHUNK_LEVEL);
	if (pick(a, 1 << (shape.subdivisionDepth - CHUNK_LEVEL))) {
		KEY = k;
		address = a;
		break;
	}
}
console.log(`chunk key ${KEY}, face ${address.face}`);
const before = build(false);
const after = build(true);
const corners = cellCorners(address.face, n, before.at.i, before.at.j);
console.log(
	`cell face-${address.face} (${before.at.i},${before.at.j}) groundCap ${before.groundCap}, ` +
		`groundRadius ${before.column.groundRadius.toFixed(4)}`,
);
console.log(
	`  radiusOfLayer(groundCap)     = ${shape.radiusOfLayer(before.groundCap).toFixed(4)}`,
);
console.log(
	`  snapped ground cap           = ${snappedSurface(shape.crustTopRadius, before.column.groundRadius, fine.blockSize).toFixed(4)}`,
);
for (let k = 0; k < corners.length; k++) {
	const a = wallSpans(before.geometry, corners, k, corners.length);
	const b = wallSpans(after.geometry, corners, k, corners.length);
	if (a.length === 0 && b.length === 0) continue;
	const holes = (spans: [number, number][]) => {
		const out: string[] = [];
		for (let s = 0; s + 1 < spans.length; s++) {
			const gap = spans[s]![1] - spans[s + 1]![0];
			if (gap > 1e-6) out.push(gap.toFixed(4));
		}
		return out;
	};
	console.log(
		`  side ${k}: before spans ${JSON.stringify(a.map((s) => [+s[0].toFixed(3), +s[1].toFixed(3)]))} holes [${holes(a)}]`,
	);
	console.log(
		`           after  spans ${JSON.stringify(b.map((s) => [+s[0].toFixed(3), +s[1].toFixed(3)]))} holes [${holes(b)}]`,
	);
}
