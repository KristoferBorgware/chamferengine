// Scratch probe: end to end. One face-edge cell, a block placed under one of
// its two names and broken under the other. What does the chunk that DRAWS it
// end up holding?
// Run: npx vite-node tools/_lens3.ts
import { DeltaStore, cellSlot, chunksHolding } from "chamfer/edit";
import { cellRepresentations, canonicalCell, rank, splitPath } from "chamfer/addressing";
import { applyDeltas, ChunkAddress, Chunk } from "chamfer/generation";
import { offsetIn } from "chamfer/edit";

const D = 8;
const C = 4;
const n = 1 << D;
const m = 1 << (D - C);
const LAYERS = 16;
const header = {
	version: 1,
	subdivisionDepth: D,
	chunkLevel: C,
	registry: [] as string[],
};

const A = { face: 0, i: 0, j: 64, layer: 5 };
const names = cellRepresentations(A.face, n, A.i, A.j).map((x) => ({
	...x,
	layer: 5,
}));
const B = names.find((x) => x.face !== A.face)!;

// Which chunk DRAWS it: canonical face plus splitPath's descent.
const canon = canonicalCell(A.face, n, A.i, A.j);
const cut = splitPath(canon.i, canon.j, D, C);
let path = 0;
for (const d of cut.path) path = path * 4 + d;
const drawer = canon.face * 4 ** C + path;
console.log("cell names", names);
console.log("cellSlot per name", names.map((x) => cellSlot(x, D, C)));
console.log("holders", chunksHolding(A, D, C));
console.log("the chunk that DRAWS it:", drawer);

for (const order of [
	["place then break", [4660, 0]],
	["break then place", [0, 4660]],
] as const) {
	const [label, [first, second]] = order as [string, [number, number]];
	const store = new DeltaStore(header);
	// Placed while standing on face 0's half of the cell...
	store.write({ ...names[0]!, layer: 5 }, first === 4660 ? 4660 : 0);
	// ...broken while standing on face 1's half.
	store.write({ ...B, layer: 5 }, second === 4660 ? 4660 : 0);

	const rows = store.rowsFor(drawer);
	const address = ChunkAddress.fromKey(drawer, C);
	const chunk = new Chunk(address, D, C, LAYERS);
	chunk.blocks.fill(4660); // solid stone everywhere
	for (let s = 0; s < chunk.slots; s++) {
		chunk.band[s * 2] = 0;
		chunk.band[s * 2 + 1] = -1;
	}
	applyDeltas(chunk, rows, D, 0);
	const named = names.find((x) => x.face === address.face)!;
	const at = offsetIn(address.path, named.i, named.j, D)!;
	const slot = rank(at.q, at.r, m);
	console.log(
		`${label}: rows handed ${rows.map((r) => r.chunkKey)} -> block at the drawn cell =`,
		chunk.blocks[slot * LAYERS + 5],
		"(4660 = stone, 0 = air)",
	);
}
