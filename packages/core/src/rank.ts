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

/**
 * How many slots a chunk reserves, counting every lattice point of its triangle.
 *
 * A chunk owns fewer than this — border points go to the lowest chunk ID that
 * contains them — so `(3m + 2) / 2` slots stay empty, 49 of 561 at depth 11 and
 * chunk level 6. That is 784 bytes a chunk, and it buys the same stride for
 * every chunk on the planet, which turns addressing into one multiply and one
 * add.
 */
export function chunkSlots(m: number): number {
	return ((m + 1) * (m + 2)) / 2;
}

/** A chunk's side in lattice steps. */
export function chunkSide(depth: number, chunkLevel: number): number {
	return 1 << (depth - chunkLevel);
}
