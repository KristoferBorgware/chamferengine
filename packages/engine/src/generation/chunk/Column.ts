/**
 * One column of blocks, with the band anything can happen in.
 *
 * `blocks` is read by index rather than through a method: a chunk of 561 cells
 * over 435 layers makes 1.7 million reads, and a call apiece is most of the
 * time meshing takes.
 *
 * `first` and `last` bound that scan. Above `first` a column is air and below
 * `last` it is solid, so no face is ever emitted outside the band, and a
 * consumer that takes the widest band over a cell and its six neighbours has
 * covered every face either of them can produce. On this world's terrain that
 * turns a 435-layer walk into three layers on land and about eighty at sea.
 *
 * Both are properties of the column rather than assumptions about the terrain.
 * A column with a cave in it reports a `last` below the cave, and the scan
 * lengthens to match.
 */
export interface Column {
	readonly blocks: Uint16Array;

	/** The first layer that is not air. The layer count if the column is empty. */
	readonly first: number;

	/** The last layer that is not opaque. `-1` if the column is solid throughout. */
	readonly last: number;
}
