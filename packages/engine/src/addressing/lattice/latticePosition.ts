import { Vec3 } from "../../math/Vec3.js";
import { faceVertices } from "../solid/faceVertices.js";
import { latticeWeights } from "./latticeWeights.js";

/**
 * The direction of lattice point `(i, j)` on `face`, at subdivision `n = 2^depth`.
 *
 * One barycentric blend, evaluated once at full depth, then one `normalize`.
 * Building the same point by repeated arc-midpoint subdivision lands on a
 * different sphere — 38.97 m out on a 1,700 m planet — and the error is fixed
 * in metres rather than shrinking with depth.
 */
export function latticePosition(
	face: number,
	n: number,
	i: number,
	j: number,
): Vec3 {
	const [a, b, c] = faceVertices(face);
	const [wa, wb, wc] = latticeWeights(n, i, j);
	return new Vec3(
		a.x * wa + b.x * wb + c.x * wc,
		a.y * wa + b.y * wb + c.y * wc,
		a.z * wa + b.z * wb + c.z * wc,
	).normalize();
}
