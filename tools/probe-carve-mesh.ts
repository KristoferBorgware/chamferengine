/**
 * Whether the carve reaches the mesh the world actually draws.
 *
 * The blocks being right is not the same claim as the picture being right: a
 * column can hold rock over air and still draw as a hillside if the mesher only
 * walks the ground down. This builds the same chunks with the layer off and on
 * and reports what changed -- the faces drawn, and the columns whose blocks
 * open more than once.
 */
import {
	CARVE_LAYER_DEFAULT,
	COARSE_MAP_DEFAULTS,
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	maxElevationFor,
	seedFromString,
} from "chamfer/generation";
import { buildChunkMesh } from "chamfer/mesh";
import { CELL_CONSTANT, WorldShape, maxCrustDepth } from "chamfer/world";

const DEPTH = 13;
const CHUNK_LEVEL = 9;
const LEVEL = 8;

const CHUNKS = 12;

const map = buildCoarseMap(seedFromString("chamfer"), {
	level: LEVEL,
	cellMetres: 32,
});
const shape = new WorldShape(
	(1 * 2 ** DEPTH) / CELL_CONSTANT,
	DEPTH,
	maxElevationFor({
		relief: COARSE_MAP_DEFAULTS.relief,
		peakRelief: COARSE_MAP_DEFAULTS.peakRelief,
	}),
	maxCrustDepth(DEPTH),
);

/**
 * Every layer the crust has.
 *
 * **A chunk shorter than the ground is a chunk of empty sky**, and it reports
 * no carve because it holds no rock at all -- which reads exactly like a carve
 * that is not running.
 */
const LAYERS = shape.crustDepth;

/**
 * Chunks standing on real land, because a chunk of ocean floor says nothing
 * about a layer that is held off at the waterline.
 */
const scout = new TerrainGenerator(map.seed, shape, map);
const LAND: number[] = [];
for (
	let key = 3 * 4 ** CHUNK_LEVEL;
	LAND.length < CHUNKS && key < 4 * 4 ** CHUNK_LEVEL;
	key += 37
) {
	const address = ChunkAddress.fromKey(key, CHUNK_LEVEL);
	const chunk = generateChunk(scout, address, CHUNK_LEVEL, LAYERS);
	// The middle of the chunk, high enough that the carve is well clear of the
	// waterline hold.
	const at = Math.floor(chunk.slots / 2);
	if (chunk.surface[at * 2]! - shape.seaLevelRadius > 150) LAND.push(key);
}

function run(carveLayer: boolean): {
	faces: number;
	stacked: number;
	air: number;
} {
	const terrain = new TerrainGenerator(map.seed, shape, map, {
		carveLayer,
		carve: CARVE_LAYER_DEFAULT,
	});
	let faces = 0;
	let stacked = 0;
	let air = 0;
	for (const key of LAND) {
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
		);
		faces += built.opaque.indices.length / 6;
		// A column whose blocks open, close and open again is an overhang.
		for (let slot = 0; slot < chunk.slots; slot++) {
			let runs = 0;
			let rock = false;
			let seenRock = false;
			for (let layer = 0; layer < LAYERS; layer++) {
				const solid = chunk.blocks[slot * LAYERS + layer] !== 0;
				if (solid && !rock) runs++;
				if (solid) seenRock = true;
				else if (seenRock) air++;
				rock = solid;
			}
			if (runs > 1) stacked++;
		}
	}
	return { faces, stacked, air };
}

const off = run(false);
const on = run(true);
console.log(
	`depth ${DEPTH}, chunk level ${CHUNK_LEVEL}, ${LAND.length} land chunks found`,
);
console.log(
	`carve off: ${off.faces.toLocaleString()} faces, ${off.stacked} columns holding rock over air, ${off.air} air blocks under rock`,
);
console.log(
	`carve on:  ${on.faces.toLocaleString()} faces, ${on.stacked} columns holding rock over air, ${on.air} air blocks under rock`,
);
console.log(
	`the layer adds ${(((on.faces - off.faces) / off.faces) * 100).toFixed(1)}% more faces`,
);
