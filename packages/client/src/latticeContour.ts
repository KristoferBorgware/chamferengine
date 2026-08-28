import type { CaveCells } from "./CaveMessage.js";

/**
 * The same contour, taken on the lattice the world is actually built on.
 *
 * **Three neighbouring cells make a triangle, and a triangle has no saddle.**
 * The cases are eight rather than sixteen and none of them is ambiguous:
 * whenever a triangle is cut at all, exactly one of its three corners is on its
 * own side and the segment joins the two edges that touch it. The guess
 * marching squares has to make cannot arise here.
 *
 * The triangles come from the cell ring rather than from rows and columns, so
 * this walks a patch that crosses one of the thirty face edges without noticing
 * and takes a pentagon's five triangles rather than six.
 *
 * **Each triangle once.** Every one of them is named three times, once by each
 * corner, so the walk keeps only the naming where this cell has the lowest
 * index of the three.
 *
 * `emit` is handed the two ends of one segment, in the flat frame's metres.
 */
export function latticeContour(
	cells: CaveCells,
	level: number,
	emit: (a: readonly [number, number], b: readonly [number, number]) => void,
): void {
	const { count, at, value, degree, ring } = cells;
	const cut = (p: number, q: number): [number, number] => {
		const pv = value[p]!;
		const qv = value[q]!;
		const t = (level - pv) / (qv - pv || 1e-9);
		return [
			at[p * 2]! + (at[q * 2]! - at[p * 2]!) * t,
			at[p * 2 + 1]! + (at[q * 2 + 1]! - at[p * 2 + 1]!) * t,
		];
	};
	for (let c = 0; c < count; c++) {
		const deg = degree[c]!;
		for (let k = 0; k < deg; k++) {
			const b = ring[c * 6 + k]!;
			const d = ring[c * 6 + ((k + 1) % deg)]!;
			if (b < 0 || d < 0) continue;
			if (b < c || d < c) continue;
			const ci = value[c]! > level;
			const bi = value[b]! > level;
			const di = value[d]! > level;
			if (ci === bi && bi === di) continue;
			// Whichever corner disagrees with the other two is the one the
			// segment cuts off.
			const alone = ci === bi ? d : bi === di ? c : b;
			const rest = ci === bi ? [c, b] : bi === di ? [b, d] : [c, d];
			emit(cut(alone, rest[0]!), cut(alone, rest[1]!));
		}
	}
}
