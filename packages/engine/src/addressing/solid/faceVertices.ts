import { Vec3 } from "../../math/Vec3.js";
import { FACES, VERTICES } from "./icosahedron.js";

/** The three vertex directions of one face, in its own A, B, C order. */
export function faceVertices(face: number): readonly [Vec3, Vec3, Vec3] {
	const [a, b, c] = FACES[face]!;
	return [VERTICES[a]!, VERTICES[b]!, VERTICES[c]!];
}
