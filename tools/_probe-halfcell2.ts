/**
 * The other half of the same story: the MESHER does see the break, so the
 * block is drawn gone while the player still collides with half of it.
 */
import {
	DeltaStore,
	STORE_VERSION,
	cellSlot,
	chunksReading,
	packBlockState,
} from "chamfer/edit";
import {
	ChunkAddress,
	TerrainGenerator,
	applyDeltas,
	buildCoarseMap,
	generateChunk,
	seedFromString,
	BlockType,
} from "chamfer/generation";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { offsetIn } from "chamfer/edit";
import { rank } from "chamfer/addressing";

const DEPTH = 10;
const CHUNK_LEVEL = 4;
let LAYER = 30;

const map = buildCoarseMap(seedFromString("chamfer"), {
	level: 6,
	cellMetres: 100,
	relief: 300,
});
const shape = new WorldShape(1700, DEPTH, 400, maxCrustDepth(DEPTH));
const terrain = new TerrainGenerator(map.seed, shape, map);

const store = new DeltaStore({
	version: STORE_VERSION,
	subdivisionDepth: DEPTH,
	chunkLevel: CHUNK_LEVEL,
	registry: ["chamfer:air", "chamfer:stone"],
});

// The cell from the previous probe: names 0:342:682 and 6:342:0.
const A = { face: 0, i: 342, j: 682 };
const B = { face: 6, i: 342, j: 0 };
{
	const col = terrain.columnAt(A.face, A.i, A.j);
	LAYER = shape.layerOfSurface(col.groundRadius);
	console.log(`ground layer of the cell: ${LAYER}, groundRadius ${col.groundRadius.toFixed(2)}`);
}
store.write({ ...B, layer: LAYER }, packBlockState(BlockType.AIR, 0));

console.log(`written under ${B.face}:${B.i}:${B.j} -> row ${cellSlot({ ...B, layer: LAYER }, DEPTH, CHUNK_LEVEL).chunkKey}`);
console.log(`store.read under ${B.face}:${B.i}:${B.j} : ${store.read({ ...B, layer: LAYER })}`);
console.log(`store.read under ${A.face}:${A.i}:${A.j} : ${store.read({ ...A, layer: LAYER })}`);

const told = chunksReading({ ...B, layer: LAYER }, DEPTH, CHUNK_LEVEL);
const onFace0 = told.filter((k) => Math.floor(k / 4 ** CHUNK_LEVEL) === 0);
console.log(`chunks told: ${told.length}, of them on face 0: ${onFace0.length}`);

// Mesh a face-0 chunk holding the A name and read its slot back.
for (const key of onFace0) {
	const address = ChunkAddress.fromKey(key, CHUNK_LEVEL);
	const at = offsetIn(address.path, A.i, A.j, DEPTH);
	if (!at) continue;
	const chunk = generateChunk(terrain, address, CHUNK_LEVEL, shape.crustDepth);
	const before = chunk.blocks[rank(at.q, at.r, chunk.m) * chunk.layerCount + LAYER];
	applyDeltas(
		chunk,
		store.rowsFor(key).map((r) => ({ chunkKey: r.chunkKey, deltas: r.deltas })),
		DEPTH,
		0,
	);
	const after = chunk.blocks[rank(at.q, at.r, chunk.m) * chunk.layerCount + LAYER];
	console.log(
		`face-0 chunk ${key}: slot block before ${before} -> after ${after} (0 = air)`,
	);
	break;
}
