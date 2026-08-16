/**
 * The slot a chunk-local `(q, r)` occupies in that chunk's arrays.
 *
 * Rows are laid out one after another over the whole chunk triangle: row `r`
 * starts after all the rows above it, and holds `m + 1 - r` points. Summing
 * those gives `q + r(2m + 3 - r) / 2`, a bijection onto `0 .. (m+1)(m+2)/2 - 1`.
 *
 * `m` is the chunk's side in lattice steps, `2^(depth - chunkLevel)`.
 */
export function rank(q: number, r: number, m: number): number {
	return q + (r * (2 * m + 3 - r)) / 2;
}
