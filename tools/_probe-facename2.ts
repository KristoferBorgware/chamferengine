// Scratch probe: two records for one cell (the two names of a face-edge cell)
// meeting in applyDeltas. Run: npx vite-node tools/_probe-facename2.ts
import { DeltaStore, cellSlot, packBlockState } from "chamfer/edit";
import { cellRepresentations, splitPath } from "chamfer/addressing";
import { BlockType, Chunk, ChunkAddress, applyDeltas } from "chamfer/generation";

const D = 8;
const C = 4;
const n = 1 << D;
const LAYERS = 16;

let found: { i: number; j: number } | null = null;
outer: for (let i = 0; i <= n; i++)
	for (let j = 0; i + j <= n; j++)
		if (cellRepresentations(0, n, i, j).length === 2) {
			found = { i, j };
			break outer;
		}
const reps = cellRepresentations(0, n, found!.i, found!.j);
const A = { face: reps[0]!.face, i: reps[0]!.i, j: reps[0]!.j, layer: 5 };
const B = { face: reps[1]!.face, i: reps[1]!.i, j: reps[1]!.j, layer: 5 };

const store = new DeltaStore({
	version: 1,
	subdivisionDepth: D,
	chunkLevel: C,
	registry: [],
});
// A player places a block, naming the cell from one side of the face edge...
store.write(A, packBlockState(BlockType.STONE, 0));
// ...then walks a few centimetres and breaks it, naming it from the other.
store.write(B, packBlockState(BlockType.AIR, 0));

const owner = cellSlot(A, D, C).chunkKey;
const split = splitPath(A.i, A.j, D, C);
const chunk = new Chunk(new ChunkAddress(A.face, split.path), D, C, LAYERS);
chunk.blocks.fill(BlockType.AIR);

const rows = store.rowsFor(owner);
console.log(
	"rows handed to the chunk drawing it:",
	rows.map((r) => `${r.chunkKey}(${r.deltas.size})`).join(" "),
);
applyDeltas(chunk, rows, D, 0);
const at = chunk.indexOf(split.q, split.r, 5);
console.log(
	"block after place-then-break:",
	chunk.blocks[at],
	`(AIR=${BlockType.AIR}, STONE=${BlockType.STONE})`,
);
