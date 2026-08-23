/**
 * Changed blocks for cells a chunk meshes but does not hold.
 *
 * A chunk reads the ring one step past its own rim -- its rim cells ask it
 * whether to draw a side face, and the apron draws it outright -- and those
 * cells sit inside the neighbouring chunk's triangle. They are generated on
 * demand rather than stored, so a change made there arrives this way instead of
 * in the chunk's own array.
 *
 * Keyed by {@link outsideKey}, and holding layer to block type. A cell is
 * listed under **every** face it has a name on, because the mesher reaches it
 * through whichever name its neighbour walk produced.
 */
export type OutsideBlocks = Map<number, Map<number, number>>;

/**
 * One cell as a number, for a face and a lattice offset.
 *
 * Room for `2^18` either way, which covers subdivision depth 17 -- the deepest
 * the ID word can name.
 */
export function outsideKey(face: number, i: number, j: number): number {
	return (face * 262144 + i) * 262144 + j;
}
