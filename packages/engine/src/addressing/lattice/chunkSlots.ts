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
