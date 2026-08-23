/**
 * What a store says about itself, once, for every row it holds.
 *
 * The subdivision depth and the chunk level are properties of the world rather
 * than of any chunk in it, so they are written here and not into each row. A
 * record names a slot inside a chunk triangle, and the triangle's side is
 * `2 ^ (subdivisionDepth - chunkLevel)` — so these two numbers are what turn a
 * slot back into a cell.
 *
 * The chunk level is set by a panel knob and moves no block: the terrain reads
 * a face and a lattice offset and never sees where the address is cut. When it
 * changes, every record converts and the store is written back under the new
 * cut.
 */
export interface StoreHeader {
	/** The format the records are written in. */
	readonly version: number;

	readonly subdivisionDepth: number;
	readonly chunkLevel: number;

	/** Block type names in order, index being the number a record carries. */
	readonly registry: readonly string[];
}

/**
 * The format this build writes.
 *
 * **2** files a cell on an icosahedron face edge under its canonical name.
 * Version 1 keyed it by whichever face the caller happened to hand in, so one
 * cell could hold two rows and a break written under one name never reached the
 * block drawn from the other. A store written that way cannot be re-keyed
 * safely -- the two rows may disagree about the same cell -- so it is refused
 * rather than converted.
 */
export const STORE_VERSION = 2;
