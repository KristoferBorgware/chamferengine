import { Vec3 } from "../../math/Vec3.js";
import { FACES, VERTICES } from "../solid/icosahedron.js";
import { neighbour } from "../neighbours/neighbour.js";

/**
 * The ring, and the running weight total, held across calls.
 *
 * A mesher asks for this once per cell and a chunk holds 561 of them, so the
 * six-slot ring and the twelve-slot total are refilled rather than allocated.
 * Nothing here is read after the call returns.
 */
const RING_FACE = new Int32Array(6);
const RING_I = new Int32Array(6);
const RING_J = new Int32Array(6);
const TOTAL = new Float64Array(12);

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
	let degree = 0;
	for (let k = 0; k < 6; k++) {
		const nb = neighbour(face, n, i, j, k);
		if (!nb) continue;
		RING_FACE[degree] = nb.face;
		RING_I[degree] = nb.i;
		RING_J[degree] = nb.j;
		degree++;
	}

	const out: Vec3[] = new Array<Vec3>(degree);
	for (let k = 0; k < degree; k++) {
		const b = (k + 1) % degree;
		TOTAL.fill(0);
		addWeights(face, n, i, j);
		addWeights(RING_FACE[k]!, n, RING_I[k]!, RING_J[k]!);
		addWeights(RING_FACE[b]!, n, RING_I[b]!, RING_J[b]!);

		let x = 0;
		let y = 0;
		let z = 0;
		for (let v = 0; v < 12; v++) {
			const w = TOTAL[v]!;
			if (w === 0) continue;
			const p = VERTICES[v]!;
			x += p.x * w;
			y += p.y * w;
			z += p.z * w;
		}
		const length = Math.sqrt(x * x + y * y + z * z);
		out[k] = new Vec3(x / length, y / length, z / length);
	}
	return out;
}

/** Add one lattice point's weights into the running total over the twelve vertices. */
function addWeights(face: number, n: number, i: number, j: number): void {
	const ids = FACES[face]!;
	const a = ids[0]!;
	const b = ids[1]!;
	const c = ids[2]!;
	TOTAL[a] = TOTAL[a]! + (n - i - j);
	TOTAL[b] = TOTAL[b]! + i;
	TOTAL[c] = TOTAL[c]! + j;
}
