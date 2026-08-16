import type { Vec3 } from "./Vec3.js";
import { FACES, VERTICES } from "./icosahedron.js";
import { latticeWeights } from "./latticeWeights.js";
import { neighbour } from "./neighbour.js";
import { normalize } from "./normalize.js";

/**
 * The corners of a cell's polygon, counter-clockwise seen from outside.
 *
 * A corner sits at the centroid of one of the triangles meeting at the cell, so
 * corner `k` comes from the cell together with its neighbours in directions `k`
 * and `k + 1`. Six of them on a hexagon, five on a pentagon.
 *
 * The three lattice points are averaged as **integer weights on global vertex
 * numbers**, and only then blended and projected. Averaging first and
 * projecting second is what keeps the 30 face edges seamless: the sum never
 * mentions a face, so two faces sharing a corner compute the same number rather
 * than two numbers that nearly agree. Projecting each point and then averaging
 * the results gives a different curve.
 */
export function cellCorners(
	face: number,
	n: number,
	i: number,
	j: number,
): Vec3[] {
	const ring: { face: number; i: number; j: number }[] = [];
	for (let k = 0; k < 6; k++) {
		const nb = neighbour(face, n, i, j, k);
		if (nb) ring.push(nb);
	}

	const out: Vec3[] = [];
	for (let k = 0; k < ring.length; k++) {
		const a = ring[k]!;
		const b = ring[(k + 1) % ring.length]!;
		const total = new Float64Array(12);
		addWeights(total, face, n, i, j);
		addWeights(total, a.face, n, a.i, a.j);
		addWeights(total, b.face, n, b.i, b.j);

		let x = 0;
		let y = 0;
		let z = 0;
		for (let v = 0; v < 12; v++) {
			const w = total[v]!;
			if (w === 0) continue;
			const p = VERTICES[v]!;
			x += p.x * w;
			y += p.y * w;
			z += p.z * w;
		}
		out.push(normalize({ x, y, z }));
	}
	return out;
}

/** Add one lattice point's weights into a running total over the twelve vertices. */
function addWeights(
	into: Float64Array,
	face: number,
	n: number,
	i: number,
	j: number,
): void {
	const w = latticeWeights(n, i, j);
	const ids = FACES[face]!;
	for (let x = 0; x < 3; x++) {
		const v = ids[x]!;
		into[v] = into[v]! + w[x]!;
	}
}
