import type { ColumnPatch, ColumnPlace } from "./ColumnPatch.js";
import { canonicalCell } from "../../addressing/neighbours/canonicalCell.js";
import { cellCorners } from "../../addressing/lattice/cellCorners.js";
import { directionToCell } from "../../addressing/lookup/directionToCell.js";
import { latticePosition } from "../../addressing/lattice/latticePosition.js";
import { neighbour } from "../../addressing/neighbours/neighbour.js";

/**
 * The cells of a patch, walked out ring by ring from the one in the middle.
 *
 * **`neighbour` is what walks**, so a patch that reaches one of the thirty face
 * edges crosses it exactly the way the engine does, and a patch that reaches
 * one of the twelve icosahedron vertices gets a five-sided cell without
 * anything here saying so. Every cell is canonicalised as it is keyed, because
 * a cell on a face edge has more than one name and a walk that did not would
 * enter the same column twice under two of them.
 *
 * **This is the half that hardly ever changes.** Where the patch stands and how
 * wide it is decide all of it; every knob that moves the ground leaves the whole
 * of it standing.
 */
export function columnPatchLayout(place: ColumnPlace): ColumnPatch {
	const { at, level, rings } = place;
	const n = 2 ** level;
	const found = directionToCell(at, n);
	const start = canonicalCell(found.face, n, found.i, found.j);

	const keyOf = (face: number, i: number, j: number): number =>
		(face * (n + 1) + i) * (n + 1) + j;
	const seen = new Map<number, number>();
	const held: { face: number; i: number; j: number }[] = [];
	const add = (c: { face: number; i: number; j: number }): boolean => {
		const key = keyOf(c.face, c.i, c.j);
		if (seen.has(key)) return false;
		seen.set(key, held.length);
		held.push(c);
		return true;
	};
	add(start);
	let frontier = [start];
	for (let ring = 0; ring < rings && frontier.length > 0; ring++) {
		const next: typeof frontier = [];
		for (const c of frontier)
			for (let d = 0; d < 6; d++) {
				const nb = neighbour(c.face, n, c.i, c.j, d);
				if (!nb) continue;
				const cell = canonicalCell(nb.face, n, nb.i, nb.j);
				if (add(cell)) next.push(cell);
			}
		frontier = next;
	}

	const count = held.length;
	const face = new Int32Array(count);
	const iOf = new Int32Array(count);
	const jOf = new Int32Array(count);
	const directions = new Float64Array(count * 3);
	const degree = new Uint8Array(count);
	const corner = new Float64Array(count * 18);
	const ring = new Int32Array(count * 6).fill(-1);

	for (let c = 0; c < count; c++) {
		const cell = held[c]!;
		face[c] = cell.face;
		iOf[c] = cell.i;
		jOf[c] = cell.j;
		const p = latticePosition(cell.face, n, cell.i, cell.j);
		directions[c * 3] = p.x;
		directions[c * 3 + 1] = p.y;
		directions[c * 3 + 2] = p.z;

		const corners = cellCorners(cell.face, n, cell.i, cell.j);
		degree[c] = corners.length;
		for (let m = 0; m < corners.length; m++) {
			const v = corners[m]!;
			corner[c * 18 + m * 3] = v.x;
			corner[c * 18 + m * 3 + 1] = v.y;
			corner[c * 18 + m * 3 + 2] = v.z;
		}
		for (let d = 0; d < 6; d++) {
			const nb = neighbour(cell.face, n, cell.i, cell.j, d);
			if (!nb) continue;
			const one = canonicalCell(nb.face, n, nb.i, nb.j);
			const to = seen.get(keyOf(one.face, one.i, one.j));
			if (to !== undefined) ring[c * 6 + d] = to;
		}
	}

	return {
		count,
		level,
		face,
		i: iOf,
		j: jOf,
		directions,
		degree,
		corner,
		ring,
		centre: latticePosition(start.face, n, start.i, start.j),
		whole: count >= 10 * 4 ** level + 2,
	};
}
