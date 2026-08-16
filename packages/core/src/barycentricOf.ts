import type { Vec3 } from "./Vec3.js";
import { cross, dot } from "./Vec3.js";
import { faceVertices } from "./icosahedron.js";

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
	const det = dot(a, cross(b, c));
	const wa = dot(dir, cross(b, c)) / det;
	const wb = dot(a, cross(dir, c)) / det;
	const wc = dot(a, cross(b, dir)) / det;
	const s = wa + wb + wc;
	return [wa / s, wb / s, wc / s];
}
