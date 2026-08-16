import type { Vec3 } from "../../math/Vec3.js";
import { faceVertices } from "../solid/faceVertices.js";

/**
 * Where a direction sits inside a face, as three weights summing to 1.
 *
 * Solves `[A B C] w = dir` by Cramer's rule and rescales, which is the same
 * blend {@link latticePosition} runs forwards. The weights are area fractions:
 * the weight on `A` is the area of the sub-triangle opposite `A` over the whole.
 *
 * A negative weight means the direction is outside this face.
 */
export function barycentricOf(
	face: number,
	dir: Vec3,
): [number, number, number] {
	const [a, b, c] = faceVertices(face);
	const det = a.dot(b.cross(c));
	const wa = dir.dot(b.cross(c)) / det;
	const wb = a.dot(dir.cross(c)) / det;
	const wc = a.dot(b.cross(dir)) / det;
	const s = wa + wb + wc;
	return [wa / s, wb / s, wc / s];
}
