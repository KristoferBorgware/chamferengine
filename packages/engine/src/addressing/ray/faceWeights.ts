import type { Vec3 } from "../../math/Vec3.js";
import { FACES, VERTICES } from "../solid/icosahedron.js";

/**
 * A vector's weights on a face's three vertices, before they are scaled to sum
 * to one.
 *
 * Solving `[A B C] w = v` is linear in `v`, so a ray's weights are its origin's
 * weights plus `t` times its direction's. That is what lets a walk find every
 * boundary crossing by division instead of by stepping and re-projecting.
 */
export function faceWeights(face: number, v: Vec3): [number, number, number] {
	const [a, b, c] = FACES[face]!;
	const A = VERTICES[a]!;
	const B = VERTICES[b]!;
	const C = VERTICES[c]!;
	const det = A.dot(B.cross(C));
	return [
		v.dot(B.cross(C)) / det,
		A.dot(v.cross(C)) / det,
		A.dot(B.cross(v)) / det,
	];
}
