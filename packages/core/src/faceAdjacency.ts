import { FACES } from "./icosahedron.js";

/** Where one face's edge leads. */
export interface EdgeLink {
	/** The face on the other side. */
	readonly face: number;
	/** Which of that face's three edges is the shared one. */
	readonly edge: number;
}

/**
 * For each face, where each of its three edges leads.
 *
 * Twenty faces times three edges is sixty entries, and each holds a face number
 * and an edge number: 180 bytes for every seam on the planet.
 *
 * Edge `e` runs from vertex `e` to vertex `(e + 1) % 3` of the face. Every
 * matched pair is traversed in opposite directions by its two faces, which is
 * the signature of consistent outward winding, so no orientation flag is needed
 * and none is stored.
 */
export const FACE_ADJACENCY: readonly (readonly [
	EdgeLink,
	EdgeLink,
	EdgeLink,
])[] = FACES.map(
	(f, fi) =>
		[0, 1, 2].map((e) => {
			const a = f[e]!;
			const b = f[(e + 1) % 3]!;
			for (let g = 0; g < 20; g++) {
				if (g === fi) continue;
				for (let e2 = 0; e2 < 3; e2++) {
					const c = FACES[g]![e2]!;
					const d = FACES[g]![(e2 + 1) % 3]!;
					if ((a === c && b === d) || (a === d && b === c))
						return { face: g, edge: e2 };
				}
			}
			throw new Error(`face ${fi} edge ${e} has no neighbour`);
		}) as unknown as readonly [EdgeLink, EdgeLink, EdgeLink],
);
