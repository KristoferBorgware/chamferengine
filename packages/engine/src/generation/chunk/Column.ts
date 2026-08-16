import type { ColumnBand } from "../terrain/ColumnBand.js";

/**
 * One column of blocks, with the band anything can happen in.
 *
 * `blocks` is read by index rather than through a method: a chunk of 561 cells
 * over 435 layers makes 1.7 million reads, and a call apiece is most of the
 * time meshing takes.
 *
 * A consumer that takes the widest band over a cell and its six neighbours has
 * covered every face either of them can produce.
 */
export interface Column extends ColumnBand {
	readonly blocks: Uint16Array;
}
