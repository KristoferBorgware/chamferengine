import type { Vec3 } from "../../math/Vec3.js";
import { FACE_CENTROIDS } from "../solid/icosahedron.js";

/**
 * Which of the twenty faces a direction falls in.
 *
 * Twenty dot products, take the largest. This is exact rather than an
 * approximation: on an icosahedron the perpendicular bisector plane between two
 * adjacent face centroids contains the two vertices of the edge they share, so
 * the face boundaries are the Voronoi boundaries of the centroids.
 *
 * `dir` must already be a unit vector.
 */
export function faceOf(dir: Vec3): number {
	let best = 0;
	let bestDot = dir.dot(FACE_CENTROIDS[0]!);
	for (let i = 1; i < 20; i++) {
		const d = dir.dot(FACE_CENTROIDS[i]!);
		if (d > bestDot) {
			bestDot = d;
			best = i;
		}
	}
	return best;
}
