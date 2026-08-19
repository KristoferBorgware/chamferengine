/**
 * The far field of the reported world: its selection held against the demo's
 * rule, and every chunk of it run through the real mesher.
 *
 * Three counts. The level of detail per ring of ground distance, engine
 * against the subdivision demo's terrainless rule, which is how the two were
 * shown to match. Coverage inside the eye's own horizon, which is how a hole
 * in the selection would show. And every chunk of the whole planet at the
 * coarse levels through generation and meshing, counting the ones that come
 * out empty -- which is how the crust floor was caught sitting less than one
 * coarse block under the deep ocean, emptying whole face-sized chunks.
 *
 * Run by hand: `npx vite-node tools/trial-far-field.ts`.
 */
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	ChunkAddress,
	ChunkPeaks,
	TerrainGenerator,
	buildCoarseMap,
	seedFromString,
	selectChunks,
} from "chamfer/generation";
import { MeshWorkerCore } from "chamfer/mesh";
import { positionToCell, splitPath } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

const QS =
	"chunkCells=8&noiseBasis=perlin&noiseScale=29400&octaves=5&lacunarity=3.4" +
	"&offsetX=15&offsetY=9&warpScale=8400&jitter=0.55&relief=1640&seaDepth=100" +
	"&ridge=0.7&landFraction=0.5&crustMetres=1744&detail=1";
const settings = PlanetSettings.fromParams(new URLSearchParams(QS));
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const RADIUS = settings.radius;
const DEPTH = settings.depth;
const CHUNK_LEVEL = settings.chunkLevel;
const DETAIL = 1;
const peaks = new ChunkPeaks(map, settings.knobs.blockSize, CHUNK_LEVEL);

// Stand on the tallest ground a sample finds, the way E does.
let s = 123456789;
const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 2 ** 32);
let summit = new Vec3(0, 0, 1);
let tallest = -1;
for (let n = 0; n < 40000; n++) {
	const z = 2 * rnd() - 1;
	const phi = 2 * Math.PI * rnd();
	const r = Math.sqrt(1 - z * z);
	const dir = new Vec3(r * Math.cos(phi), r * Math.sin(phi), z);
	const cell = positionToCell(dir, shape.n);
	const h = map.heightAt(cell.face, cell.i, cell.j, DEPTH);
	if (h > tallest) {
		tallest = h;
		summit = dir.normalize();
	}
}
const terrain = new TerrainGenerator(seed, shape, map, settings.terrainOptions());
const cell = positionToCell(summit, shape.n);
const column = terrain.columnAt(cell.face, cell.i, cell.j);
const eyeRadius = Math.max(column.groundRadius, column.waterRadius) + 1.86;
console.log(
	`standing on ${(eyeRadius - 1.86 - RADIUS).toFixed(0)} m ground ` +
	`(map says ${tallest.toFixed(0)} m), radius ${RADIUS.toFixed(0)} m, ` +
	`chunk level ${CHUNK_LEVEL}`,
);

const engine = selectChunks(
	DEPTH, CHUNK_LEVEL, summit, eyeRadius, RADIUS, DETAIL,
	shape.maxElevation, peaks,
);
// The demo's world: no terrain, the eye eye-height off the sphere it measures.
const demo = selectChunks(
	DEPTH, CHUNK_LEVEL, summit, RADIUS + 1.86, RADIUS, DETAIL, 0,
);

const covering = (
	chosen: { chunkLevel: number; key: number }[],
	dir: Vec3,
) => {
	const at = positionToCell(dir, shape.n);
	for (const c of chosen) {
		const address = ChunkAddress.fromKey(c.key, c.chunkLevel);
		if (address.face !== at.face) continue;
		const split = splitPath(at.i, at.j, DEPTH, c.chunkLevel);
		let match = true;
		for (let level = 0; level < c.chunkLevel; level++)
			if (split.path[level] !== address.path[level]) match = false;
		if (match) return c;
	}
	return null;
};

// LOD by ground distance, engine against demo, along one great circle.
const east = summit.cross(new Vec3(0, 1, 0)).normalize();
console.log("\nground distance : engine lod (cell) | demo lod (cell)");
for (const metres of [0, 25, 50, 100, 200, 400, 800, 1600, 3200, 6400]) {
	const angle = metres / RADIUS;
	const dir = summit
		.scale(Math.cos(angle))
		.add(east.scale(Math.sin(angle)))
		.normalize();
	const e = covering(engine, dir);
	const d = covering(demo, dir);
	const say = (c: { lod: number } | null) =>
		c ? `lod ${c.lod} (${2 ** c.lod} m)` : "CULLED";
	console.log(
		`  ${String(metres).padStart(5)} m : ${say(e).padEnd(14)} | ${say(d)}`,
	);
}

// Coverage inside the eye's own horizon: any hole is a real hole.
const eyeHorizon = Math.acos(RADIUS / eyeRadius);
let checked = 0, holes = 0;
for (let n = 0; n < 30000; n++) {
	const z = 2 * rnd() - 1;
	const phi = 2 * Math.PI * rnd();
	const r = Math.sqrt(1 - z * z);
	const dir = new Vec3(r * Math.cos(phi), r * Math.sin(phi), z).normalize();
	const angle = Math.acos(Math.max(-1, Math.min(1, dir.dot(summit))));
	if (angle > eyeHorizon * 0.95) continue;
	checked++;
	if (!covering(engine, dir)) holes++;
}
console.log(
	`\ncoverage inside the eye horizon (${(RADIUS * eyeHorizon).toFixed(0)} m):` +
	` ${checked} directions, ${holes} uncovered`,
);

// Every selected chunk through the real mesher: empties and throws, by lod.
const core = new MeshWorkerCore({
	kind: "setup",
	map: map.toSnapshot(),
	seaLevelRadius: RADIUS,
	subdivisionDepth: DEPTH,
	maxElevation: shape.maxElevation,
	crustDepth: shape.crustDepth,
	apron: true,
	debugSeams: false,
	terrain: settings.terrainOptions(),
});
const byLod = new Map<number, { chunks: number; empty: number; threw: number }>();
let id = 0;
for (const c of engine) {
	const row = byLod.get(c.lod) ?? { chunks: 0, empty: 0, threw: 0 };
	row.chunks++;
	try {
		const mesh = core.run({
			kind: "chunk", id: id++, key: c.key,
			chunkLevel: c.chunkLevel, lod: c.lod,
		});
		const triangles =
			mesh.opaque.indices.length / 3 + mesh.translucent.indices.length / 3;
		if (triangles === 0) row.empty++;
	} catch {
		row.threw++;
	}
	byLod.set(c.lod, row);
}
console.log(`\n${engine.length} chunks selected, through the mesher:`);
for (const [lod, row] of [...byLod].sort((a, b) => a[0] - b[0]))
	console.log(
		`  lod ${String(lod).padStart(2)}: ${String(row.chunks).padStart(5)} chunks, ` +
		`${row.empty} empty, ${row.threw} threw`,
	);

// Every chunk of the whole planet at the coarse levels: how common is empty?
for (const chunkLevel of [0, 1, 2, 3]) {
	const lod = CHUNK_LEVEL - chunkLevel;
	let empty = 0, threw = 0;
	const total = 20 * 4 ** chunkLevel;
	const examples: number[] = [];
	for (let key = 0; key < total; key++) {
		try {
			const mesh = core.run({ kind: "chunk", id: id++, key, chunkLevel, lod });
			const triangles =
				mesh.opaque.indices.length / 3 +
				mesh.translucent.indices.length / 3;
			if (triangles === 0) {
				empty++;
				if (examples.length < 6) examples.push(key);
			}
		} catch {
			threw++;
		}
	}
	console.log(
		`whole planet at level ${chunkLevel} (lod ${lod}): ` +
		`${empty} of ${total} empty, ${threw} threw` +
		(examples.length ? ` -- e.g. keys ${examples.join(", ")}` : ""),
	);
}
