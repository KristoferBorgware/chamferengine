import { DIRECTIONS } from "./DIRECTIONS.js";
import { FACES } from "./icosahedron.js";
import { FACE_ADJACENCY } from "./faceAdjacency.js";
import { latticeWeights } from "./latticeWeights.js";

/** A lattice point named by a face and an offset inside it. */
export interface FaceCell {
	readonly face: number;
	readonly i: number;
	readonly j: number;
}

/**
 * The icosahedron vertex a cell sits on, or `-1` when it sits on none.
 *
 * A cell is a vertex when two of its three weights are zero, which puts all of
 * its weight on one corner. Those twelve cells are the pentagons.
 */
export function pentagonVertex(
	face: number,
	n: number,
	i: number,
	j: number,
): number {
	const w = latticeWeights(n, i, j);
	let full = -1;
	let zeros = 0;
	for (let x = 0; x < 3; x++) {
		if (w[x] === 0) zeros++;
		else full = x;
	}
	return zeros === 2 ? FACES[face]![full]! : -1;
}

/** Turn a set of weights on global vertex numbers into an offset on `face`. */
function offsetOn(
	face: number,
	weights: ReadonlyMap<number, number>,
): FaceCell | null {
	const ids = FACES[face]!;
	let total = 0;
	const w = ids.map((v) => {
		const x = weights.get(v) ?? 0;
		total += x;
		return x;
	});
	if (total === 0) return null;
	for (const v of weights.keys()) if (!ids.includes(v)) return null;
	return { face, i: w[1]!, j: w[2]! };
}

/**
 * The five neighbours of the pentagon on icosahedron vertex `p`, in order
 * around it, starting from the step `startFace` takes toward its own next
 * vertex.
 *
 * The ring is built by rotating face to face around the vertex rather than by
 * reflecting across one edge. Two of the five faces meeting at a vertex touch
 * the starting face only at that vertex, so a single reflection cannot reach
 * them.
 */
export function pentagonRing(
	p: number,
	n: number,
	startFace: number,
): FaceCell[] {
	let g = startFace;
	const ring: FaceCell[] = [];
	for (let s = 0; s < 5; s++) {
		const e = FACES[g]!.indexOf(p);
		const x = FACES[g]![(e + 1) % 3]!;
		const cell = offsetOn(
			g,
			new Map([
				[p, n - 1],
				[x, 1],
			]),
		);
		if (cell) ring.push(cell);
		g = FACE_ADJACENCY[g]![e]!.face;
	}
	return ring;
}

/**
 * The neighbour of `(face, i, j)` in direction `k`, at subdivision `n`.
 *
 * Returns `null` only for `k = 5` on one of the twelve pentagons, whose ring is
 * five long. That is a direction which does not exist rather than a gap: the
 * ring is short, never holed and never doubled.
 *
 * Away from those twelve, stepping off the face is a reflection and the whole
 * of it is three additions. A lattice point is integer weights on global vertex
 * numbers; step outside and exactly one weight goes negative. Reflecting across
 * the shared edge sends `(alpha, beta, gamma)` to
 * `(alpha + gamma, beta + gamma, -gamma)`, where `gamma` is the negative one.
 * The point itself does not move — only the name it is written under. The table
 * is consulted for one thing: which face is over there.
 */
export function neighbour(
	face: number,
	n: number,
	i: number,
	j: number,
	k: number,
): FaceCell | null {
	const p = pentagonVertex(face, n, i, j);
	if (p >= 0) return pentagonRing(p, n, face)[k] ?? null;

	const [di, dj] = DIRECTIONS[k]!;
	const ni = i + di;
	const nj = j + dj;
	const w = latticeWeights(n, ni, nj);

	let negative = -1;
	for (let x = 0; x < 3; x++) if (w[x]! < 0) negative = x;
	if (negative < 0) return { face, i: ni, j: nj };

	// The edge opposite the vertex whose weight went negative is the one crossed.
	const edge = (negative + 1) % 3;
	const link = FACE_ADJACENCY[face]![edge]!;
	const here = FACES[face]!;

	const gamma = w[negative]!;
	const u = here[(negative + 1) % 3]!;
	const v = here[(negative + 2) % 3]!;
	const alpha = w[(negative + 1) % 3]!;
	const beta = w[(negative + 2) % 3]!;
	const third = FACES[link.face]!.find((x) => x !== u && x !== v)!;

	return offsetOn(
		link.face,
		new Map([
			[u, alpha + gamma],
			[v, beta + gamma],
			[third, -gamma],
		]),
	);
}

/**
 * How many neighbours a lattice point has: 5 on the twelve pentagons, 6
 * everywhere else.
 */
export function degree(face: number, n: number, i: number, j: number): number {
	let count = 0;
	for (let k = 0; k < 6; k++)
		if (neighbour(face, n, i, j, k) !== null) count++;
	return count;
}
