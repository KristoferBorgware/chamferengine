/**
 * One number naming a chunk triangle at one level.
 *
 * A key only names a triangle within its own level, so the level has to travel
 * with it: the same key at two levels is two different triangles covering
 * different ground. Anything holding chunks from more than one level at once —
 * a renderer's resident set, a mesh source's queue — keys on this rather than
 * on the key alone.
 */
export function selectionId(chunkLevel: number, key: number): number {
	return chunkLevel * 0x100000 + key;
}
