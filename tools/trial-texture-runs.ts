// How long a merged wall is, which is what decides whether a texture has to
// tile and how far.
//
//   npx vite-node tools/trial-texture-runs.ts
//
// A cap is one cell's own polygon and is never merged, so its texture fits a
// tile exactly. A wall is a RUN over layers -- merged down a column wherever
// the neighbour's solidity does not change -- so its texture repeats along the
// radial axis, and how far is what an atlas would have to reproduce by hand
// and a texture array gets from the sampler.
import { CHUNK_VERTEX_FLOATS, buildChunkMesh } from "chamfer/mesh";
import {
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import { WorldShape, maxCrustDepth } from "chamfer/world";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const LAYERS = 60;
const KEYS = [400, 401, 402, 1200, 1201, 2400, 3600, 5000];

const map = buildCoarseMap(seedFromString("chamfer"), {
	level: 6,
	cellMetres: 100,
	relief: 300,
	peakRelief: 120,
	seaDepth: 100,
});
const shape = new WorldShape(1700, DEPTH, 150, maxCrustDepth(DEPTH));

for (const caves of [false, true]) {
	const terrain = new TerrainGenerator(map.seed, shape, map, {
		caves,
		caveDepth: 40,
	});
	let caps = 0;
	let walls = 0;
	const runs = new Map<number, number>();
	for (const key of KEYS) {
		const chunk = generateChunk(
			terrain,
			ChunkAddress.fromKey(key, CHUNK_LEVEL),
			CHUNK_LEVEL,
			LAYERS,
		);
		const built = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, terrain),
			shape,
			map.seed,
			{ apron: true, surfaceGrid: shape.blockSize },
		);
		for (const part of [built.opaque, built.translucent]) {
			const v = part.vertices;
			const at = (index: number): number => {
				const o = index * CHUNK_VERTEX_FLOATS;
				return Math.hypot(
					v[o]! + built.origin.x,
					v[o + 1]! + built.origin.y,
					v[o + 2]! + built.origin.z,
				);
			};
			for (let t = 0; t + 2 < part.indices.length; t += 3) {
				const r = [0, 1, 2].map((c) => at(part.indices[t + c]!));
				const span = Math.max(...r) - Math.min(...r);
				// A cap is flat: every corner at one radius. Anything else is
				// a wall, and its span in layers is what its texture repeats
				// over. Two triangles to a quad, so a wall is counted twice
				// and halved at the end.
				if (span < shape.blockSize * 0.02) {
					caps++;
					continue;
				}
				walls++;
				const layers = Math.max(1, Math.round(span / shape.blockSize));
				runs.set(layers, (runs.get(layers) ?? 0) + 1);
			}
		}
	}
	const quads = walls / 2;
	let total = 0;
	let longest = 0;
	let overOne = 0;
	for (const [layers, count] of runs) {
		total += layers * count;
		longest = Math.max(longest, layers);
		if (layers > 1) overOne += count;
	}
	console.log(
		`\ncaves ${caves ? "on " : "off"}: ${caps.toLocaleString("en-US")} cap triangles, ` +
			`${quads.toLocaleString("en-US")} wall quads`,
	);
	console.log(
		`  layers a wall covers: mean ${(total / walls).toFixed(2)}, ` +
			`longest ${longest}, over one ${((100 * overOne) / walls).toFixed(1)}%`,
	);
	const sorted = [...runs.entries()].sort((a, b) => a[0] - b[0]);
	const shown = sorted.slice(0, 8);
	for (const [layers, count] of shown)
		console.log(
			`    ${String(layers).padStart(3)} layer${layers === 1 ? " " : "s"}: ` +
				`${((100 * count) / walls).toFixed(1)}%`,
		);
	if (sorted.length > shown.length)
		console.log(
			`    over ${shown[shown.length - 1]![0]}: ` +
				`${(
					(100 *
						sorted
							.slice(shown.length)
							.reduce((s, [, c]) => s + c, 0)) /
					walls
				).toFixed(1)}%`,
		);
}
