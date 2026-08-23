import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import { chunksReading } from "chamfer/edit";
import { buildChunkMesh } from "chamfer/mesh";
import { WorldShape } from "chamfer/world";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const LAYERS = 48;
const SEED = seedFromString("reach");

let map: CoarseMap;
let shape: WorldShape;
let terrain: TerrainGenerator;

beforeAll(() => {
	map = buildCoarseMap(SEED, { level: 6, cellMetres: 100, relief: 100 });
	shape = new WorldShape(1700, DEPTH, 150, LAYERS);
	terrain = new TerrainGenerator(SEED, shape, map);
});

/** Every distinct cell the real mesher asks the sampler for. */
function sampledBy(key: number): string[] {
	const address = ChunkAddress.fromKey(key, CHUNK_LEVEL);
	const chunk = generateChunk(terrain, address, CHUNK_LEVEL, LAYERS);
	const real = new ChunkColumnSampler(chunk, terrain);
	const asked = new Set<string>();
	buildChunkMesh(
		chunk,
		{
			columnAt(face: number, i: number, j: number) {
				asked.add(`${face}:${i}:${j}`);
				return real.columnAt(face, i, j);
			},
		},
		shape,
		SEED,
		{ apron: true },
	);
	return [...asked];
}

// **The store and the mesher have to agree about how far a chunk reads, and
// the mesher is the authority.** A rim cell asks its own ring -- one step past
// the triangle -- and the apron then draws that ring, and an apron cell asks
// *its* ring for the band to walk, the corner occlusion and the sky exposure.
// That is two steps. Routing one reached the apron cells and not the cells
// they read, so a share of every chunk's samples answered from the seed
// however far anybody dug.
describe("what a chunk's mesher asks for", () => {
	it("is entirely inside the set an edit is routed to", () => {
		let sampled = 0;
		const unrouted: string[] = [];
		for (let key = 0; key < 40; key++)
			for (const name of sampledBy(key)) {
				const [face, i, j] = name.split(":").map(Number) as [
					number,
					number,
					number,
				];
				sampled++;
				if (
					!chunksReading(
						{ face, i, j, layer: 0 },
						DEPTH,
						CHUNK_LEVEL,
					).includes(key)
				)
					unrouted.push(`chunk ${key} reads ${name}`);
			}
		// The sample is real: a chunk holds 153 cells and asks for far more.
		expect(sampled / 40).toBeGreaterThan(200);
		expect(unrouted.slice(0, 5)).toEqual([]);
	});
});
