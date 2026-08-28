import { describe, expect, it } from "vitest";
import {
	DIRECTIONS,
	canonicalCell,
	joinPath,
	neighbour,
	rank,
} from "chamfer/addressing";
import { layoutFits, plantPatchLayout } from "chamfer/generation";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const N = 1 << DEPTH;
const M = 1 << (DEPTH - CHUNK_LEVEL);
const HOPS = 5;

/** Every path of `chunkLevel` digits, which is every chunk of one face. */
function everyPath(level: number): number[][] {
	let out: number[][] = [[]];
	for (let l = 0; l < level; l++) {
		const next: number[][] = [];
		for (const path of out)
			for (let d = 0; d < 4; d++) next.push([...path, d]);
		out = next;
	}
	return out;
}

/** The patch a chunk has, found by stepping the lattice one cell at a time. */
function walked(
	face: number,
	path: readonly number[],
): {
	face: number[];
	i: number[];
	j: number[];
	slot: number[];
	ring: number[];
} {
	const keyOf = (f: number, i: number, j: number): number =>
		(f * (N + 1) + i) * (N + 1) + j;
	const seen = new Map<number, number>();
	const f: number[] = [];
	const ii: number[] = [];
	const jj: number[] = [];
	const own: number[] = [];
	const add = (
		one: { face: number; i: number; j: number },
		slot: number,
	): number => {
		const cell = canonicalCell(one.face, N, one.i, one.j);
		const key = keyOf(cell.face, cell.i, cell.j);
		const was = seen.get(key);
		if (was !== undefined) {
			if (slot >= 0) own[was] = slot;
			return was;
		}
		const at = f.length;
		seen.set(key, at);
		f.push(cell.face);
		ii.push(cell.i);
		jj.push(cell.j);
		own.push(slot);
		return at;
	};
	let frontier: number[] = [];
	for (let q = 0; q <= M; q++)
		for (let r = 0; q + r <= M; r++) {
			const [i, j] = joinPath(path, q, r, DEPTH);
			frontier.push(add({ face, i, j }, rank(q, r, M)));
		}
	for (let hop = 0; hop < HOPS && frontier.length > 0; hop++) {
		const next: number[] = [];
		for (const c of frontier)
			for (let d = 0; d < 6; d++) {
				const nb = neighbour(f[c]!, N, ii[c]!, jj[c]!, d);
				if (!nb) continue;
				const before = f.length;
				const at = add(nb, -1);
				if (at >= before) next.push(at);
			}
		frontier = next;
	}
	const ring: number[] = new Array(f.length * 6).fill(-1);
	for (let c = 0; c < f.length; c++)
		for (let d = 0; d < 6; d++) {
			const nb = neighbour(f[c]!, N, ii[c]!, jj[c]!, d);
			if (!nb) continue;
			const one = canonicalCell(nb.face, N, nb.i, nb.j);
			const to = seen.get(keyOf(one.face, one.i, one.j));
			if (to !== undefined) ring[c * 6 + d] = to;
		}
	return { face: f, i: ii, j: jj, slot: own, ring };
}

describe("plantPatchLayout", () => {
	// **The table has to be the walk, or a chunk gets a different patch
	// depending on where it is** -- and the two chunks either side of a face
	// edge would then disagree about a tree that straddles them. This is the
	// whole of what the fast path rests on, over every chunk of one face.
	it("gives the same patch as walking the lattice, chunk for chunk", () => {
		let fast = 0;
		let slow = 0;
		let wrong = "";
		for (const path of everyPath(CHUNK_LEVEL)) {
			const [originI, originJ] = joinPath(path, 0, 0, DEPTH);
			const [stepI] = joinPath(path, 1, 0, DEPTH);
			const layout = plantPatchLayout(M, HOPS, stepI - originI);
			if (!layoutFits(layout, originI, originJ, N)) {
				slow++;
				continue;
			}
			fast++;
			const one = walked(3, path);
			if (one.face.length !== layout.count) {
				wrong = `${path.join("")}: ${one.face.length} columns against ${layout.count}`;
				break;
			}
			for (let c = 0; c < layout.count && !wrong; c++) {
				const i = originI + layout.di[c]!;
				const j = originJ + layout.dj[c]!;
				if (
					one.face[c] !== 3 ||
					one.i[c] !== i ||
					one.j[c] !== j ||
					one.slot[c] !== layout.slot[c]!
				)
					wrong = `${path.join("")} column ${c}: walked ${one.face[c]},${one.i[c]},${one.j[c]} slot ${one.slot[c]}, table ${i},${j} slot ${layout.slot[c]}`;
				for (let d = 0; d < 6 && !wrong; d++)
					if (one.ring[c * 6 + d] !== layout.ring[c * 6 + d]!)
						wrong = `${path.join("")} column ${c} direction ${d}: walked ${one.ring[c * 6 + d]}, table ${layout.ring[c * 6 + d]}`;
			}
			if (wrong) break;
		}
		expect(wrong).toBe("");
		// The test is worth nothing if the fast path is never taken, and the
		// fallback is worth nothing if it is always taken.
		expect(fast).toBeGreaterThan(0);
		expect(slow).toBeGreaterThan(0);
		expect(slow / (fast + slow)).toBeLessThan(0.35);
	});

	// A turned triangle is an upright one negated, which is what lets one table
	// serve both -- so the table has to hold both signs of every step.
	it("holds a shape that survives being turned", () => {
		const layout = plantPatchLayout(M, HOPS, 1);
		const seat = new Map<number, number>();
		for (let c = 0; c < layout.count; c++)
			seat.set(layout.di[c]! * 4096 + layout.dj[c]!, c);
		// Every step's own opposite is a step of some column's ring, so the
		// six directions close on themselves.
		let missing = 0;
		for (let d = 0; d < 6; d++) {
			const step = DIRECTIONS[d]!;
			let back = false;
			for (let e = 0; e < 6; e++) {
				const other = DIRECTIONS[e]!;
				if (other[0] === -step[0] && other[1] === -step[1]) back = true;
			}
			if (!back) missing++;
		}
		expect(missing).toBe(0);
		expect(seat.size).toBe(layout.count);
	});

	// The triangle is what the chunk owns, and every slot of it exactly once.
	it("gives the chunk's own triangle a slot apiece", () => {
		const layout = plantPatchLayout(M, HOPS, -1);
		const slots = ((M + 1) * (M + 2)) / 2;
		const seen = new Set<number>();
		for (let c = 0; c < layout.count; c++) {
			if (layout.slot[c]! < 0) continue;
			expect(seen.has(layout.slot[c]!)).toBe(false);
			seen.add(layout.slot[c]!);
		}
		expect(seen.size).toBe(slots);
	});
});
