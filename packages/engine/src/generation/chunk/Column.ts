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
 *
 * The two radii carry what the blocks cannot: where the terrain function put
 * the surfaces before they were rounded to this column's layer grid. A chunk
 * drawn coarser rounds to a coarser grid, and two neighbours at different
 * levels then disagree about a surface the terrain placed identically — the
 * mesher uses the radii to put both caps back on one shared grid. Zero means
 * nobody recorded them, and the mesher falls back to the layer grid alone.
 */
export interface Column extends ColumnBand {
	readonly blocks: Uint16Array;

	/** Metres from the planet's centre to the top of the ground, 0 unknown. */
	readonly groundRadius: number;

	/** Metres from the centre to the top of the water, 0 unknown. */
	readonly waterRadius: number;
}
