// Seed-vs-patched probe 2: reconstruct the actual side quads on ONE edge of
// one cell, before and after a placed block, at lod 2.
import {
	BlockType,
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
	applyDeltas,
} from "chamfer/generation";
import { DeltaStore, packBlockState } from "chamfer/edit";
import { meshChunk } from "chamfer/mesh";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { Vec3 } from "chamfer/math";
import { cellCorners, joinPath, latticePosition } from "chamfer/addressing";

const DEPTH = 10;
const CHUNK_LEVEL = 4;
const LOD = 2;
const seed = seedFromString("chamfer");
const map = buildCoarseMap(seed, { level: 6, cellMetres: 100, relief: 300 });
const fine = new WorldShape(1700, DEPTH, 300, maxCrustDepth(DEPTH));
const shape = fine.atLod(LOD);
const coarseLevel = CHUNK_LEVEL - LOD;
const terrain = new TerrainGenerator(seed, shape, map);
const n = 1 << shape.subdivisionDepth;

const KEY = 0;
const CELL = { i: 2, j: 2 };
const address = ChunkAddress.fromKey(KEY, coarseLevel);
const corners = cellCorners(address.face, n, CELL.i, CELL.j).map((c) =>
	new Vec3(c.x, c.y, c.z).normalize(),
);
const [oi, oj] = joinPath(address.path, 0, 0, shape.subdivisionDepth);
const origin = latticePosition(address.face, n, oi, oj).scale(
	shape.seaLevelRadius,
);

const store = new DeltaStore({
	version: 1,
	subdivisionDepth: DEPTH,
	chunkLevel: CHUNK_LEVEL,
	registry: [],
});
const cap = shape.layerOfSurface(
	terrain.columnAt(address.face, CELL.i, CELL.j).groundRadius,
);
store.write(
	{
		face: address.face,
		i: CELL.i * 2 ** LOD,
		j: CELL.j * 2 ** LOD,
		layer: (cap - 1) * 2 ** LOD,
	},
	packBlockState(BlockType.SNOW),
);
const rows = store.rowsUnder(KEY, coarseLevel);

function quads(withEdit: boolean) {
	const chunk = generateChunk(terrain, address, coarseLevel, shape.crustDepth);
	const outside = withEdit ? applyDeltas(chunk, rows, DEPTH, LOD) : null;
	const sampler = new ChunkColumnSampler(chunk, terrain, outside);
	const verts: {
		dir: number;
		r: number;
		color: [number, number, number];
	}[] = [];
	const tris: [number, number, number][] = [];
	const sink = {
		vertex(
			x: number,
			y: number,
			z: number,
			r: number,
			g: number,
			b: number,
		) {
			const p = new Vec3(x + origin.x, y + origin.y, z + origin.z);
			const d = p.normalize();
			let which = -1;
			for (let c = 0; c < corners.length; c++)
				if (Math.abs(d.dot(corners[c]!) - 1) < 1e-12) which = c;
			verts.push({ dir: which, r: p.length(), color: [r, g, b] });
			return verts.length - 1;
		},
		triangle(a: number, b: number, c: number) {
			tris.push([a, b, c]);
		},
	};
	meshChunk(chunk, sampler, shape, seed, origin, sink, sink, {
		apron: false,
		surfaceGrid: fine.blockSize,
		speckle: 0,
	});
	// A side quad on this cell: every vertex on one of exactly two of this
	// cell's corners.
	const spans = new Map<string, Set<string>>();
	for (const [a, b, c] of tris) {
		const vs = [verts[a]!, verts[b]!, verts[c]!];
		if (vs.some((v) => v.dir < 0)) continue;
		const dirs = [...new Set(vs.map((v) => v.dir))].sort();
		if (dirs.length !== 2) continue;
		const radii = [...new Set(vs.map((v) => Number(v.r.toFixed(4))))].sort(
			(x, y) => y - x,
		);
		if (radii.length !== 2) continue;
		const key = dirs.join("-");
		const col = vs[0]!.color.map((x) => Number(x.toFixed(3))).join(",");
		(spans.get(key) ?? spans.set(key, new Set()).get(key)!).add(
			`[${radii[0]} -> ${radii[1]}] color ${col}`,
		);
	}
	return spans;
}

console.log(
	`coarse layer tops: cap-1 ${shape.radiusOfLayer(cap - 1).toFixed(4)}  cap ${shape.radiusOfLayer(cap).toFixed(4)}  cap+1 ${shape.radiusOfLayer(cap + 1).toFixed(4)}`,
);
for (const [label, spans] of [
	["BEFORE", quads(false)],
	["AFTER ", quads(true)],
] as const) {
	console.log(`\n--- ${label} ---`);
	for (const [edge, set] of [...spans].sort())
		console.log(`  edge ${edge}: ${[...set].join(" | ")}`);
}
