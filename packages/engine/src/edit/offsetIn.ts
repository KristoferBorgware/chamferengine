/**
 * Where a lattice point sits inside one chunk's own triangle.
 *
 * The inverse of the descent that builds `(i, j)` from a path and an offset,
 * walked forward instead of backward. A cell on a chunk border belongs to two
 * or three triangles at once and this answers for the one asked, rather than
 * for whichever would win the border rule — a chunk generates every slot of its
 * triangle, its neighbours' cells included, so the mesher can read its own rim.
 *
 * `null` where the point is outside the triangle entirely.
 */
export function offsetIn(
	path: readonly number[],
	i: number,
	j: number,
	depth: number,
): { q: number; r: number } | null {
	let n = 1 << depth;
	let q = i;
	let r = j;
	for (const digit of path) {
		n >>= 1;
		if (digit === 1) q -= n;
		else if (digit === 2) r -= n;
		else if (digit === 3) {
			q = n - q;
			r = n - r;
		}
	}
	if (q < 0 || r < 0 || q + r > n) return null;
	return { q, r };
}
