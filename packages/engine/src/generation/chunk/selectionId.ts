/**
 * One number naming a chunk triangle at one level.
 *
 * A key only names a triangle within its own level, so the level has to travel
 * with it: the same key at two levels is two different triangles covering
 * different ground. Anything holding chunks from more than one level at once —
 * a renderer's resident set, a mesh source's queue — keys on this rather than
 * on the key alone.
 *
 * The key's field is 2^40 wide because a key is not small: 20 triangles split
 * `level` times is `20 * 4^level`, past a million by level 9 — a 16-cell
 * chunk on a depth-13 world — and 3.4e11 at the deepest level the address
 * word allows. A field of 2^20, which this function once used, collides
 * there, and two colliding chunks share one slot in every resident set: each
 * upload evicts the other, and the ground flickers with holes that no mesh
 * ever had. The product stays exact: level is at most 17, and `17 * 2^40`
 * is far inside `float64`'s 2^53.
 */
export function selectionId(chunkLevel: number, key: number): number {
	return chunkLevel * 2 ** 40 + key;
}

/** The level and key a {@link selectionId} was made from. */
export function selectionOf(id: number): { chunkLevel: number; key: number } {
	const chunkLevel = Math.floor(id / 2 ** 40);
	return { chunkLevel, key: id - chunkLevel * 2 ** 40 };
}
