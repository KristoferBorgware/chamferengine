/**
 * The range of layers of a column where a face can appear.
 *
 * Above `first` a column is air and below `last` it is solid, so nothing
 * outside the band can be a surface. On this world's terrain that is a handful
 * of layers against the 435 the crust runs to.
 *
 * Both are read off the blocks as they are written rather than assumed from the
 * shape of the terrain, so a column with a cave in it reports a `last` below
 * the cave.
 */
export interface ColumnBand {
	/** The first layer that is not air. The layer count if the column is empty. */
	readonly first: number;

	/** The last layer that is not opaque. `-1` if the column is solid throughout. */
	readonly last: number;
}
