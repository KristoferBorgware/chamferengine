// Scratch probe for the face-naming lens. npx vite-node tools/_face_lens.ts
import {
	cellRepresentations,
	canonicalCell,
	directionToCell,
	latticePosition,
	neighbour,
	pentagonVertex,
} from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

const D = 8;
const n = 1 << D;

// ---------- find a face-edge cell (two names) and a pentagon (five names)
let edgeCell: { face: number; i: number; j: number } | null = null;
for (let i = 1; i < n && !edgeCell; i++) {
	if (cellRepresentations(0, n, i, 0).length === 2) edgeCell = { face: 0, i, j: 0 };
}
const pent = { face: 0, i: 0, j: 0 };
console.log("edge cell", edgeCell, "names", cellRepresentations(0, n, edgeCell!.i, 0));
console.log("pentagon names", cellRepresentations(0, n, 0, 0));

// ---------- H1: is latticePosition name-invariant?
function posDiff(face: number, i: number, j: number): number {
	const names = cellRepresentations(face, n, i, j);
	const base = latticePosition(names[0]!.face, n, names[0]!.i, names[0]!.j);
	let worst = 0;
	for (const m of names) {
		const p = latticePosition(m.face, n, m.i, m.j);
		worst = Math.max(
			worst,
			Math.abs(p.x - base.x),
			Math.abs(p.y - base.y),
			Math.abs(p.z - base.z),
		);
	}
	return worst;
}
let worstEdge = 0;
let differing = 0;
let total = 0;
for (let i = 0; i <= n; i++) {
	for (const [f, a, b] of [
		[0, i, 0],
		[0, 0, i],
		[0, i, n - i],
	] as const) {
		if (a < 0 || b < 0 || a + b > n) continue;
		total++;
		const d = posDiff(f, a, b);
		if (d > 0) differing++;
		worstEdge = Math.max(worstEdge, d);
	}
}
console.log(
	`H1 latticePosition: ${differing} of ${total} face-edge cells differ between names, worst component ${worstEdge}`,
);

// ---------- H5: pentagon ring, same set under all five names?
{
	const names = cellRepresentations(pent.face, n, pent.i, pent.j);
	const sets = names.map((m) => {
		const s = new Set<string>();
		for (let k = 0; k < 6; k++) {
			const nb = neighbour(m.face, n, m.i, m.j, k);
			if (!nb) continue;
			const c = canonicalCell(nb.face, n, nb.i, nb.j);
			s.add(`${c.face}:${c.i}:${c.j}`);
		}
		return [...s].sort().join(",");
	});
	console.log("H5 pentagon rings by name:");
	for (let x = 0; x < names.length; x++)
		console.log("   ", names[x], "->", sets[x]);
	console.log("   all equal:", new Set(sets).size === 1);
}

// ---------- H8: does directionToCell ever give a name outside cellRepresentations?
{
	let bad = 0;
	let seenNames = new Map<string, Set<number>>();
	for (let t = 0; t < 40000; t++) {
		const v = { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() * 2 - 1 };
		const len = Math.hypot(v.x, v.y, v.z);
		if (len < 1e-6) continue;
		const dir = new Vec3(v.x / len, v.y / len, v.z / len);
		const got = directionToCell(dir, n);
		if (got.i < 0 || got.j < 0 || got.i + got.j > n) {
			bad++;
			continue;
		}
		const canon = canonicalCell(got.face, n, got.i, got.j);
		const key = `${canon.face}:${canon.i}:${canon.j}`;
		if (cellRepresentations(got.face, n, got.i, got.j).length > 1) {
			let s = seenNames.get(key);
			if (!s) seenNames.set(key, (s = new Set()));
			s.add(got.face);
		}
	}
	let bothNames = 0;
	for (const s of seenNames.values()) if (s.size > 1) bothNames++;
	console.log(
		`H8 directionToCell: ${bad} out-of-triangle results; ${seenNames.size} multi-named cells hit, ${bothNames} of them named under more than one face`,
	);
}

// ---------- H3: sample inside one edge cell, which names come back?
{
	const c = edgeCell!;
	const centre = latticePosition(c.face, n, c.i, c.j);
	const names = new Map<string, number>();
	// jitter within a fraction of a cell
	const step = 0.4 / n;
	for (let t = 0; t < 400; t++) {
		const j = () => (Math.random() * 2 - 1) * step;
		const v = { x: centre.x + j(), y: centre.y + j(), z: centre.z + j() };
		const len = Math.hypot(v.x, v.y, v.z);
		const dir = new Vec3(v.x / len, v.y / len, v.z / len);
		const got = directionToCell(dir, n);
		const canon = canonicalCell(got.face, n, got.i, got.j);
		if (canon.face !== canonicalCell(c.face, n, c.i, c.j).face) continue;
		if (canon.i !== canonicalCell(c.face, n, c.i, c.j).i) continue;
		const k = `${got.face}:${got.i}:${got.j}`;
		names.set(k, (names.get(k) ?? 0) + 1);
	}
	console.log("H3 names produced inside one edge cell:", [...names.entries()]);
}
