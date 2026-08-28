import type { StandPatch } from "./growStand.js";
import { canonicalCell } from "../../addressing/neighbours/canonicalCell.js";
import { latticePosition } from "../../addressing/lattice/latticePosition.js";
import { neighbour } from "../../addressing/neighbours/neighbour.js";

/** The ground one reference plant is grown on, and the cell it stands in. */
export interface PlantReference {
	readonly patch: StandPatch;
	readonly i: number;
	readonly j: number;
}

/**
 * A flat patch to grow a reference plant on, wide enough to hold one.
 *
 * **The same patch serves every variant of a species**, and there are dozens of
 * them: a species' widest plant sets how far the patch has to reach, and every
 * plant of that species is grown on that same ground. Rebuilding it each time
 * is `29%` of what a template costs.
 *
 * **The face's own middle**, which is more than a patch's width from every edge
 * that this size could reach, and where the gnomonic stretch across a face is
 * at its smallest.
 *
 * **Flat ground is the right reference, not a simplification.** A plant is
 * placed by absolute height: the rod stamp converts a slot into each column's
 * own ground as it crosses, so a canopy hanging over a cliff lands at the same
 * radius either way. Giving every column the same ground makes those
 * conversions the identity and changes nothing else.
 */
export function plantReferencePatch(
	level: number,
	hops: number,
): PlantReference {
	const n = 2 ** level;
	const i0 = Math.max(1, Math.floor(n / 3));
	const j0 = Math.max(1, Math.floor(n / 3));

	const keyOf = (f: number, i: number, j: number): number =>
		(f * (n + 1) + i) * (n + 1) + j;
	const seen = new Map<number, number>();
	const face: number[] = [];
	const iOf: number[] = [];
	const jOf: number[] = [];
	const add = (one: { face: number; i: number; j: number }): number => {
		const cell = canonicalCell(one.face, n, one.i, one.j);
		const key = keyOf(cell.face, cell.i, cell.j);
		const held = seen.get(key);
		if (held !== undefined) return held;
		const at = face.length;
		seen.set(key, at);
		face.push(cell.face);
		iOf.push(cell.i);
		jOf.push(cell.j);
		return at;
	};
	add({ face: 0, i: i0, j: j0 });
	let frontier = [0];
	for (let hop = 0; hop < hops && frontier.length > 0; hop++) {
		const next: number[] = [];
		for (const c of frontier)
			for (let d = 0; d < 6; d++) {
				const nb = neighbour(face[c]!, n, iOf[c]!, jOf[c]!, d);
				if (!nb) continue;
				const before = face.length;
				const at = add(nb);
				if (at >= before) next.push(at);
			}
		frontier = next;
	}

	const count = face.length;
	const directions = new Float64Array(count * 3);
	const ring = new Int32Array(count * 6).fill(-1);
	for (let c = 0; c < count; c++) {
		const p = latticePosition(face[c]!, n, iOf[c]!, jOf[c]!);
		directions[c * 3] = p.x;
		directions[c * 3 + 1] = p.y;
		directions[c * 3 + 2] = p.z;
		for (let d = 0; d < 6; d++) {
			const nb = neighbour(face[c]!, n, iOf[c]!, jOf[c]!, d);
			if (!nb) continue;
			const one = canonicalCell(nb.face, n, nb.i, nb.j);
			const to = seen.get(keyOf(one.face, one.i, one.j));
			if (to !== undefined) ring[c * 6 + d] = to;
		}
	}

	return {
		patch: {
			count,
			level,
			face: Int32Array.from(face),
			i: Int32Array.from(iOf),
			j: Int32Array.from(jOf),
			directions,
			ring,
		},
		i: i0,
		j: j0,
	};
}
