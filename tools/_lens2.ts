// Scratch probe: does the live world reach one face-edge cell under both of
// its names, and does the store answer the same for both?
// Run: npx vite-node tools/_lens2.ts
import { DeltaStore, cellSlot } from "chamfer/edit";
import {
	cellCorners,
	cellRepresentations,
	canonicalCell,
	latticePosition,
	positionToCell,
	directionToCell,
} from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

const D = 10;
const C = 5;
const n = 1 << D;
const header = {
	version: 1,
	subdivisionDepth: D,
	chunkLevel: C,
	registry: [] as string[],
};

// A lattice point in the middle of the face-0 / face-1 edge.
const A = { face: 0, i: 0, j: n >> 2, layer: 200 };
const names = cellRepresentations(A.face, n, A.i, A.j);
console.log("names of one cell:", names, "canonical", canonicalCell(A.face, n, A.i, A.j));
for (const x of names)
	console.log("  cellSlot", x, cellSlot({ ...x, layer: 200 }, D, C));

// Sample points across the cell's own polygon and see which name the live
// lookup gives them.
const corners = cellCorners(A.face, n, A.i, A.j);
const centre = latticePosition(A.face, n, A.i, A.j);
const tally = new Map<string, number>();
for (const corner of corners)
	for (let t = 1; t <= 19; t++) {
		const f = t / 20;
		const p = new Vec3(
			centre.x * (1 - f) + corner.x * f,
			centre.y * (1 - f) + corner.y * f,
			centre.z * (1 - f) + corner.z * f,
		).normalize();
		const got = positionToCell(p.scale(1700), n);
		const key = `${got.face}:${got.i}:${got.j}`;
		tally.set(key, (tally.get(key) ?? 0) + 1);
		const dir = directionToCell(p, n);
		const dkey = `dir ${dir.face}:${dir.i}:${dir.j}`;
		tally.set(dkey, (tally.get(dkey) ?? 0) + 1);
	}
console.log("what the live lookup names those points:", [...tally]);

// Break the block under one name; read it back under both.
const store = new DeltaStore(header);
const B = names.find((x) => x.face !== A.face)!;
const readers = store.write({ ...B, layer: 200 }, 0);
console.log("wrote AIR naming the cell", B, "-> readers", readers.length);
console.log("read under", B, "=", store.read({ ...B, layer: 200 }));
console.log("read under", A, "=", store.read(A));
console.log("rows", store.size, "records", store.count);

// And now the other half: place a block under the other name.
store.write({ ...A, layer: 200 }, 4660);
console.log("after writing STONE under the other name: rows", store.size, "records", store.count);
console.log("read under", B, "=", store.read({ ...B, layer: 200 }));
console.log("read under", A, "=", store.read(A));
