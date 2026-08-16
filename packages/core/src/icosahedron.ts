import type { Vec3 } from "./Vec3.js";
import { normalize } from "./normalize.js";
import { vec3 } from "./Vec3.js";

/**
 * The golden ratio. The twelve icosahedron vertices are the cyclic permutations
 * of (0, ±1, ±PHI), which is why it appears here at all.
 */
export const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * The twelve vertices, as unit directions from the planet's centre.
 *
 * A cell sits on a vertex of the subdivided icosahedron, so these twelve are
 * the twelve pentagons, at every subdivision depth and in every world.
 *
 * The order is fixed. Vertices 0 and 3 carry the coordinate poles and vertex 11
 * carries the prime meridian, so renumbering this array moves every latitude and
 * longitude in every world ever generated.
 */
export const VERTICES: readonly Vec3[] = [
	[-1, PHI, 0],
	[1, PHI, 0],
	[-1, -PHI, 0],
	[1, -PHI, 0],
	[0, -1, PHI],
	[0, 1, PHI],
	[0, -1, -PHI],
	[0, 1, -PHI],
	[PHI, 0, -1],
	[PHI, 0, 1],
	[-PHI, 0, -1],
	[-PHI, 0, 1],
].map(([x, y, z]) => normalize(vec3(x!, y!, z!)));

/**
 * The twenty faces, each three indices into {@link VERTICES}.
 *
 * Every triple runs counter-clockwise seen from outside the sphere, so a
 * direction table written in one face's frame means the same turn on all
 * twenty.
 */
export const FACES: readonly (readonly [number, number, number])[] = [
	[0, 11, 5],
	[0, 5, 1],
	[0, 1, 7],
	[0, 7, 10],
	[0, 10, 11],
	[1, 5, 9],
	[5, 11, 4],
	[11, 10, 2],
	[10, 7, 6],
	[7, 1, 8],
	[3, 9, 4],
	[3, 4, 2],
	[3, 2, 6],
	[3, 6, 8],
	[3, 8, 9],
	[4, 9, 5],
	[2, 4, 11],
	[6, 2, 10],
	[8, 6, 7],
	[9, 8, 1],
];

/**
 * The direction of each face's centroid.
 *
 * The perpendicular bisector between two adjacent centroids contains the edge
 * those faces share, so the nearest centroid to a direction names the face that
 * direction falls in — exactly, not approximately.
 */
export const FACE_CENTROIDS: readonly Vec3[] = FACES.map(([a, b, c]) => {
	const va = VERTICES[a]!,
		vb = VERTICES[b]!,
		vc = VERTICES[c]!;
	return normalize(
		vec3(va.x + vb.x + vc.x, va.y + vb.y + vc.y, va.z + vb.z + vc.z),
	);
});

/** The three vertex directions of one face, in its own A, B, C order. */
export function faceVertices(face: number): readonly [Vec3, Vec3, Vec3] {
	const [a, b, c] = FACES[face]!;
	return [VERTICES[a]!, VERTICES[b]!, VERTICES[c]!];
}

/** The thirty edges, each a pair of vertex indices with the lower index first. */
export const EDGES: readonly (readonly [number, number])[] = (() => {
	const seen = new Set<string>();
	const out: [number, number][] = [];
	for (const f of FACES)
		for (let e = 0; e < 3; e++) {
			const p = f[e]!,
				q = f[(e + 1) % 3]!;
			const key = p < q ? `${p},${q}` : `${q},${p}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(p < q ? [p, q] : [q, p]);
		}
	return out;
})();
