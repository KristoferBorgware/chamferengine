/**
 * The barycentric weights of a lattice point on its face's three vertices.
 *
 * `(i, j)` runs over `i, j >= 0` with `i + j <= n`, so the weights are
 * `(n-i-j, i, j)` on `A`, `B` and `C`. Written this way a lattice point is a
 * set of integer weights attached to global vertex numbers, and that
 * description never mentions a face — which is what makes crossing a face edge
 * three additions rather than a change of frame.
 */
export function latticeWeights(
	n: number,
	i: number,
	j: number,
): [number, number, number] {
	return [n - i - j, i, j];
}
