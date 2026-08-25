// What `canonicalCell`'s guard is worth, over the real engine.
//
//   npx vite-node tools/trial-canonical.ts
//
// A cell has more than one name only on a face edge or at an icosahedron
// vertex, which is where one of its three weights is zero -- so the guard is
// three comparisons standing in for a walk of twenty faces. This walks the ring
// of every cell of a large patch, which is what a mesher and the delta store
// do, and runs both against each other for time and for agreement.
//
// A wall-clock measurement, run by hand. It is not part of make-reference.js,
// whose scripts are plain Node.

import { canonicalCell, cellRepresentations, neighbour, directionToCell } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

/** The search, as `canonicalCell` ran it before the guard. */
function bySearch(face: number, n: number, i: number, j: number) {
	const all = cellRepresentations(face, n, i, j);
	let best = all[0]!;
	for (const c of all) if (c.face < best.face) best = c;
	return best;
}

const n = 256;
const start = directionToCell(new Vec3(0.3, 0.5, 0.81).normalize(), n);
const keyOf = (c: { face: number; i: number; j: number }) =>
	(c.face * (n + 1) + c.i) * (n + 1) + c.j;
const seen = new Map<number, { face: number; i: number; j: number }>();
const list: { face: number; i: number; j: number }[] = [];
const add = (c: { face: number; i: number; j: number }) => {
	const k = keyOf(c);
	if (seen.has(k)) return false;
	seen.set(k, c);
	list.push(c);
	return true;
};
add(canonicalCell(start.face, n, start.i, start.j));
let frontier = [list[0]!];
for (let r = 0; r < 256; r++) {
	const next: typeof frontier = [];
	for (const c of frontier)
		for (let d = 0; d < 6; d++) {
			const nb = neighbour(c.face, n, c.i, c.j, d);
			if (!nb) continue;
			const cc = canonicalCell(nb.face, n, nb.i, nb.j);
			if (add(cc)) next.push(cc);
		}
	frontier = next;
}
console.log(`patch ${list.length.toLocaleString()} cells at n = ${n}`);

let steps = 0;
let same = 0;
let t = Date.now();
for (const c of list)
	for (let d = 0; d < 6; d++) {
		const nb = neighbour(c.face, n, c.i, c.j, d);
		if (nb) { bySearch(nb.face, n, nb.i, nb.j); steps++; }
	}
const before = Date.now() - t;
t = Date.now();
for (const c of list)
	for (let d = 0; d < 6; d++) {
		const nb = neighbour(c.face, n, c.i, c.j, d);
		if (nb) canonicalCell(nb.face, n, nb.i, nb.j);
	}
const after = Date.now() - t;
t = Date.now();
for (const c of list) for (let d = 0; d < 6; d++) neighbour(c.face, n, c.i, c.j, d);
const walk = Date.now() - t;

for (const c of list)
	for (let d = 0; d < 6; d++) {
		const nb = neighbour(c.face, n, c.i, c.j, d);
		if (!nb) continue;
		const a = canonicalCell(nb.face, n, nb.i, nb.j);
		const b = bySearch(nb.face, n, nb.i, nb.j);
		if (a.face === b.face && a.i === b.i && a.j === b.j) same++;
	}
console.log(`${steps.toLocaleString()} ring steps`);
console.log(`  search every step  ${before} ms`);
console.log(`  guarded            ${after} ms   (${(before / after).toFixed(1)}x)`);
console.log(`  neighbour alone    ${walk} ms`);
console.log(`  same answer on     ${same.toLocaleString()} of ${steps.toLocaleString()}`);
