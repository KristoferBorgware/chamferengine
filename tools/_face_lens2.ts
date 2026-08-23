// End-to-end: two names of one face-edge cell through DeltaStore + applyDeltas.
import {
	DeltaStore,
	cellSlot,
	chunksReading,
	packBlockState,
	typeOf,
} from "chamfer/edit";
import { cellRepresentations, canonicalCell, splitPath } from "chamfer/addressing";
import { Chunk, ChunkAddress, applyDeltas, BlockType } from "chamfer/generation";

const D = 8;
const C = 4;
const n = 1 << D;
const LAYERS = 8;
const LAYER = 3;

const A = { face: 0, i: 1, j: 0, layer: LAYER };
const names = cellRepresentations(A.face, n, A.i, A.j);
const B = { ...names.find((x) => x.face !== A.face)!, layer: LAYER };
console.log("one cell, two names:", names, "canonical", canonicalCell(A.face, n, A.i, A.j));
console.log("cellSlot(A)", cellSlot(A, D, C), " cellSlot(B)", cellSlot(B, D, C));
console.log(
	"chunksReading(A) == chunksReading(B):",
	JSON.stringify([...chunksReading(A, D, C)].sort()) ===
		JSON.stringify([...chunksReading(B, D, C)].sort()),
);

const header = { version: 1, subdivisionDepth: D, chunkLevel: C, registry: [] as string[] };

// --- scenario 1: break under one name, ask under the other
{
	const store = new DeltaStore(header);
	store.write(B, packBlockState(BlockType.AIR));
	console.log(
		`\nSCENARIO 1 (mine it naming the cell face-${B.face}):`,
		"read under B =", store.read(B),
		" read under A =", store.read(A),
		" -> A falls through to the seed:", store.read(A) === undefined,
	);
}

// --- scenario 2: place under one name, break under the other
{
	const store = new DeltaStore(header);
	store.write(A, packBlockState(BlockType.STONE));
	const readers = store.write(B, packBlockState(BlockType.AIR));
	console.log(
		`\nSCENARIO 2 (place naming face-${A.face}, then break naming face-${B.face}):`,
	);
	console.log("  rows in the store:", store.size, " records:", store.count);

	// which chunk actually draws the cell?
	const canon = canonicalCell(A.face, n, A.i, A.j);
	const cut = splitPath(canon.i, canon.j, D, C);
	let path = 0;
	for (const d of cut.path) path = path * 4 + d;
	const drawKey = canon.face * 4 ** C + path;
	console.log("  the chunk that DRAWS it:", drawKey, " readers told:", readers);

	const address = ChunkAddress.fromKey(drawKey, C);
	const chunk = new Chunk(address, D, C, LAYERS);
	chunk.blocks.fill(BlockType.STONE);
	for (let s = 0; s < chunk.slots; s++) {
		chunk.band[s * 2] = 0;
		chunk.band[s * 2 + 1] = -1;
	}
	const rows = store.rowsUnder(drawKey, C);
	console.log("  rows handed to it:", rows.map((r) => r.chunkKey));
	applyDeltas(chunk, rows, D, 0);
	const slot = cut ? null : null;
	// find the slot the way applyDeltas does
	const at = (() => {
		const cutHere = splitPath(canon.i, canon.j, D, C);
		return cutHere;
	})();
	const m = chunk.m;
	const rankOf = (q: number, r: number): number => q + (r * (2 * m + 3 - r)) / 2;
	const idx = rankOf(at.q, at.r) * LAYERS + LAYER;
	console.log(
		"  block in the drawn chunk after both edits:",
		`raw ${chunk.blocks[idx]} (AIR=${BlockType.AIR}, STONE=${BlockType.STONE}) at idx ${idx}`,
	);
	void slot;
}

// --- scenario 3: break first, then place, both naming the same cell differently
{
	const store = new DeltaStore(header);
	store.write(B, packBlockState(BlockType.AIR));
	store.write(A, packBlockState(BlockType.STONE));
	const canon = canonicalCell(A.face, n, A.i, A.j);
	const cut = splitPath(canon.i, canon.j, D, C);
	let path = 0;
	for (const d of cut.path) path = path * 4 + d;
	const drawKey = canon.face * 4 ** C + path;
	const chunk = new Chunk(ChunkAddress.fromKey(drawKey, C), D, C, LAYERS);
	chunk.blocks.fill(BlockType.STONE);
	applyDeltas(chunk, store.rowsUnder(drawKey, C), D, 0);
	const m = chunk.m;
	const idx = (cut.q + (cut.r * (2 * m + 3 - cut.r)) / 2) * LAYERS + LAYER;
	console.log(
		"\nSCENARIO 3 (break naming B, then place naming A): raw",
		chunk.blocks[idx],
	);
}
void typeOf;
