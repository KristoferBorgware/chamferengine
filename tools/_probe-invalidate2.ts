// Scratch probe: the coarse chunks change() never invalidates -- does the edit
// actually reach their data? Run: npx vite-node tools/_probe-invalidate2.ts
import { DeltaStore, cellSlot, chunksReading, coarseCell, packBlockState } from "chamfer/edit";
import { coarseChunkKey } from "chamfer/generation";
import { BlockType, Chunk, ChunkAddress, applyDeltas } from "chamfer/generation";

const D = 8;
const C = 4;
const LAYERS = 12;

const cell = { face: 0, i: 66, j: 66, layer: 4 };
const store = new DeltaStore({
	version: 1,
	subdivisionDepth: D,
	chunkLevel: C,
	registry: [],
});
const owner = cellSlot(cell, D, C).chunkKey;
const fineReaders = store.write(cell, packBlockState(BlockType.AIR, 0));
console.log(`edited cell face 0 (66,66) layer 4; owner row ${owner}`);
console.log(`fine readers: ${fineReaders.sort((a, b) => a - b)}`);

for (const lod of [1, 2, 3]) {
	const level = C - lod;
	const told = new Set(fineReaders.map((k) => coarseChunkKey(k, C, level)));
	const cc = coarseCell(cell, D, lod);
	const draws = chunksReading({ ...cc, layer: cell.layer >> lod }, D - lod, level);
	console.log(`\nlod ${lod} (chunk level ${level}):`);
	console.log(`  change() drops: ${[...told].sort((a, b) => a - b)}`);
	console.log(`  chunks reading the coarse cell: ${draws.sort((a, b) => a - b)}`);
	for (const key of draws) {
		const rows = store.rowsUnder(key, level);
		const chunk = new Chunk(
			ChunkAddress.fromKey(key, level),
			D - lod,
			level,
			LAYERS,
		);
		chunk.blocks.fill(BlockType.STONE);
		const outside = applyDeltas(chunk, rows, D, lod);
		let inside = 0;
		for (const b of chunk.blocks) if (b !== BlockType.STONE) inside++;
		console.log(
			`  chunk ${key}: ${told.has(key) ? "INVALIDATED" : "never invalidated"}; rowsUnder gives [${rows.map((r) => r.chunkKey)}]` +
				` -> ${inside} of its own blocks change, ${outside.size} cells past its rim change`,
		);
	}
}
