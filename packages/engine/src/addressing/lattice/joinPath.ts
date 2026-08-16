/**
 * Rebuild `(i, j)` from the route down the triangles and the leftover offset.
 *
 * The inverse of {@link splitPath}: replay the digits from the bottom up,
 * undoing the middle child's half turn where it was taken.
 */
export function joinPath(
	path: readonly number[],
	q: number,
	r: number,
	depth: number,
): [number, number] {
	let n = 1 << (depth - path.length);
	let i = q;
	let j = r;
	for (let l = path.length - 1; l >= 0; l--) {
		const d = path[l]!;
		if (d === 1) i += n;
		else if (d === 2) j += n;
		else if (d === 3) {
			i = n - i;
			j = n - j;
		}
		n <<= 1;
	}
	return [i, j];
}
