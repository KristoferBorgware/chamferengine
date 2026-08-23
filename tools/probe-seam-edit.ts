/**
 * Whether an edit reaches the chunk NEXT DOOR that reads the cell it landed in.
 *
 * A chunk meshes cells one step past its own rim: its rim cells ask the ring
 * around them whether to draw a side face, and the apron draws that ring
 * outright. Those cells sit inside the neighbouring chunk's triangle, so this
 * asks whether a change made there is visible from here.
 *
 *   npx vite-node tools/probe-seam-edit.ts
 */
import { DeltaStore, chunksHolding, packBlockState, STORE_VERSION } from "chamfer/edit";
import { ChunkAddress, ChunkColumnSampler, generateChunk } from "chamfer/generation";
import { joinPath, neighbour, splitPath } from "chamfer/addressing";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const N = 1 << DEPTH;
const M = 1 << (DEPTH - CHUNK_LEVEL);

const header = {
	version: STORE_VERSION,
	subdivisionDepth: DEPTH,
	chunkLevel: CHUNK_LEVEL,
	registry: ["chamfer:air", "chamfer:stone"],
};

const face = 3;
const path = [1, 2, 0, 3];
const here = new ChunkAddress(face, path);
const key = here.key;

// Walk the rim of this chunk, step outward, and collect the cells the mesher
// reads that are not its own.
const outside: { i: number; j: number }[] = [];
const mine = new Set<string>();
for (let q = 0; q <= M; q++)
	for (let r = 0; q + r <= M; r++) {
		const [i, j] = joinPath(path, q, r, DEPTH);
		mine.add(`${face}:${i}:${j}`);
	}
for (let q = 0; q <= M; q++)
	for (let r = 0; q + r <= M; r++) {
		if (q > 0 && r > 0 && q + r < M) continue;
		const [i, j] = joinPath(path, q, r, DEPTH);
		for (let k = 0; k < 6; k++) {
			const nb = neighbour(face, N, i, j, k);
			if (!nb || nb.face !== face) continue;
			if (mine.has(`${nb.face}:${nb.i}:${nb.j}`)) continue;
			if (outside.some((c) => c.i === nb.i && c.j === nb.j)) continue;
			outside.push({ i: nb.i, j: nb.j });
		}
	}

console.log(
	`depth ${DEPTH}, chunk level ${CHUNK_LEVEL}: a chunk holds ${((M + 1) * (M + 2)) / 2} slots ` +
		`and reads ${outside.length} more from one step past its rim.`,
);

// Break a block in each of them and ask who is told.
let told = 0;
for (const cell of outside) {
	const store = new DeltaStore(header);
	const keys = store.write(
		{ face, i: cell.i, j: cell.j, layer: 20 },
		packBlockState(0),
	);
	if (keys.includes(key)) told++;
}
console.log(
	`   of those ${outside.length} cells, an edit is handed to this chunk for ${told}.`,
);

// And what the mesher sees when it asks for one.
const holders = chunksHolding(
	{ face, i: outside[0]!.i, j: outside[0]!.j, layer: 20 },
	DEPTH,
	CHUNK_LEVEL,
);
console.log(
	`   the first of them is held by chunk(s) ${holders.map((h) => h.chunkKey).join(", ")}; ` +
		`this chunk is ${key}.`,
);
void ChunkColumnSampler;
void generateChunk;
void splitPath;
