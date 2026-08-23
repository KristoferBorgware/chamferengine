// Scratch probe: does the delta store treat the two names of a face-edge cell
// as one cell? Run: npx vite-node tools/_probe-facename.ts
import { DeltaStore, cellSlot, chunksHolding, chunksReading } from "chamfer/edit";
import {
	cellRepresentations,
	directionToCell,
	latticePosition,
	cellCorners,
} from "chamfer/addressing";

const D = 8;
const C = 4;
const n = 1 << D;
const header = {
	version: 1,
	subdivisionDepth: D,
	chunkLevel: C,
	registry: [] as string[],
};

let found: { i: number; j: number } | null = null;
outer: for (let i = 0; i <= n; i++)
	for (let j = 0; i + j <= n; j++) {
		if (cellRepresentations(0, n, i, j).length === 2) {
			found = { i, j };
			break outer;
		}
	}
const reps = cellRepresentations(0, n, found!.i, found!.j);
console.log("face-edge cell, two names:", JSON.stringify(reps));

const A = { face: reps[0]!.face, i: reps[0]!.i, j: reps[0]!.j, layer: 5 };
const B = { face: reps[1]!.face, i: reps[1]!.i, j: reps[1]!.j, layer: 5 };
console.log("cellSlot(A) =", cellSlot(A, D, C));
console.log("cellSlot(B) =", cellSlot(B, D, C));

const store = new DeltaStore(header);
store.write(A, 0x1234);
console.log("write STONE under A. read(A) =", store.read(A), " read(B) =", store.read(B));
store.write(B, 0x0000);
console.log(
	"then write AIR under B. rows =",
	store.size,
	" records =",
	store.count,
	" read(A) =",
	store.read(A),
	" read(B) =",
	store.read(B),
);

// Which name does positionToCell / directionToCell hand back for each side of
// this same cell?
// Sample points inside the cell: its centre and each of its corners pulled a
// little toward the centre. A cell straddles a face edge, so points inside one
// cell fall on both sides of it.
const names = new Map<number, number>();
const centre = latticePosition(reps[0]!.face, n, reps[0]!.i, reps[0]!.j).normalize();
const corners = cellCorners(reps[0]!.face, n, reps[0]!.i, reps[0]!.j);
const sample = (v: { x: number; y: number; z: number }): void => {
	const got = directionToCell(
		new (centre.constructor as new (x: number, y: number, z: number) => typeof centre)(
			v.x,
			v.y,
			v.z,
		).normalize(),
		n,
	);
	names.set(got.face, (names.get(got.face) ?? 0) + 1);
};
sample(centre);
for (const c of corners) {
	const u = c.normalize();
	sample({
		x: centre.x + (u.x - centre.x) * 0.8,
		y: centre.y + (u.y - centre.y) * 0.8,
		z: centre.z + (u.z - centre.z) * 0.8,
	});
}
console.log("faces directionToCell returns for points inside this one cell:", [
	...names,
]);

// Every chunk that holds a slot for the cell, and everyone told about the write.
const holders = new Set<number>();
for (const rep of reps)
	for (const h of chunksHolding({ ...rep, layer: 5 }, D, C)) holders.add(h.chunkKey);
const told = new Set(chunksReading(A, D, C));
console.log("holders:", [...holders].sort((a, b) => a - b));
console.log(
	"holders NOT told about the write:",
	[...holders].filter((k) => !told.has(k)),
);
