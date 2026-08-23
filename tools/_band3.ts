/** Why does a 58-layer shaft change nothing at lod 3? */
import {
	BlockType,
	ChunkAddress,
	TerrainGenerator,
	applyDeltas,
	buildCoarseMap,
	coarseChunkKey,
	generateChunk,
	seedFromString,
} from "../packages/engine/src/generation/index.js";
import {
	DeltaStore,
	STORE_VERSION,
	coarseCell,
	packBlockState,
	slotCell,
} from "../packages/engine/src/edit/index.js";
import { joinPath } from "../packages/engine/src/addressing/index.js";
import { WorldShape } from "../packages/engine/src/world/index.js";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const LAYERS = 60;
const M = 1 << (DEPTH - CHUNK_LEVEL);

const map = buildCoarseMap(seedFromString("chamfer"), {
	level: 6,
	cellMetres: 100,
	relief: 100,
});
const baseShape = new WorldShape(1700, DEPTH, 150, LAYERS);
const header = {
	version: STORE_VERSION,
	subdivisionDepth: DEPTH,
	chunkLevel: CHUNK_LEVEL,
	registry: ["chamfer:air", "chamfer:stone"],
};

const fine = new ChunkAddress(3, [1, 2, 0, 3]);
const mine: { face: number; i: number; j: number }[] = [];
for (let q = 0; q <= M; q++)
	for (let r = 0; q + r <= M; r++) {
		const [i, j] = joinPath(fine.path, q, r, DEPTH);
		mine.push({ face: fine.face, i, j });
	}
const cell = mine[80]!;

for (let lod = 0; lod <= 4; lod++) {
	const store = new DeltaStore(header);
	for (let layer = 0; layer < LAYERS - 2; layer++)
		store.write({ ...cell, layer }, packBlockState(BlockType.AIR));

	const chunkLevel = CHUNK_LEVEL - lod;
	const key = coarseChunkKey(fine.key, CHUNK_LEVEL, chunkLevel);
	const address = ChunkAddress.fromKey(key, chunkLevel);
	const shape = baseShape.atLod(lod);
	const gen = new TerrainGenerator(map.seed, shape, map);
	const rows = store.rowsUnder(key, chunkLevel);

	const before = generateChunk(gen, address, chunkLevel, shape.crustDepth);
	const after = generateChunk(gen, address, chunkLevel, shape.crustDepth);
	const outside = applyDeltas(after, rows, DEPTH, lod);
	let changed = 0;
	for (let n = 0; n < after.blocks.length; n++)
		if (after.blocks[n] !== before.blocks[n]) changed++;
	let bandMoved = 0;
	for (let n = 0; n < after.band.length; n++)
		if (after.band[n] !== before.band[n]) bandMoved++;

	// where the record lands
	const first = rows[0];
	let sample = "none";
	if (first) {
		const recs = [...first.deltas.records()];
		const f = slotCell(
			first.chunkKey,
			recs[0]![0],
			recs[0]![1],
			DEPTH,
			chunkLevel + lod,
		);
		const c = lod === 0 ? f : coarseCell(f, DEPTH, lod);
		sample = `record0 fine ${f.face}:${f.i}:${f.j}@${f.layer} -> coarse ${c.face}:${c.i}:${c.j}@${c.layer}`;
	}
	console.log(
		`lod ${lod}: layerCount ${shape.crustDepth}, rows ${rows.length}, recs ${rows.reduce((s, r) => s + r.deltas.size, 0)}, blocks changed ${changed}, band entries moved ${bandMoved}, outside ${outside.size}`,
	);
	console.log("   ", sample);
}
