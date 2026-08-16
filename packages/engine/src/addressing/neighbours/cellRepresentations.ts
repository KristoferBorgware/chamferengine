import type { FaceCell } from "./FaceCell.js";
import { FACES } from "../solid/icosahedron.js";
import { latticeWeights } from "../lattice/latticeWeights.js";

/**
 * Every face-and-offset pair that names the same lattice point.
 *
 * A point strictly inside a face has one. A point on a face edge has two, and a
 * point at an icosahedron vertex has five, since five faces meet there. The
 * point is found by matching weights against global vertex numbers, so no
 * geometry is involved.
 */
export function cellRepresentations(
	face: number,
	n: number,
	i: number,
	j: number,
): FaceCell[] {
	const w = latticeWeights(n, i, j);
	const ids = FACES[face]!;
	const carried = new Map<number, number>();
	for (let x = 0; x < 3; x++) if (w[x]! > 0) carried.set(ids[x]!, w[x]!);

	const out: FaceCell[] = [];
	for (let g = 0; g < 20; g++) {
		const gv = FACES[g]!;
		let ok = true;
		for (const v of carried.keys()) if (!gv.includes(v)) ok = false;
		if (!ok) continue;
		const gw = gv.map((v) => carried.get(v) ?? 0);
		out.push({ face: g, i: gw[1]!, j: gw[2]! });
	}
	return out;
}
