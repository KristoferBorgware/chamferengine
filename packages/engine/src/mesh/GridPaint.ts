/**
 * Which parts of the grid are drawn, chosen once for a whole world.
 *
 * The grid is the world drawn as its own scaffolding: every chunk selected
 * and levelled exactly as the terrain would be, then built as a flat shell of
 * hexagons at the crust top instead of ground. What these switch is only the
 * paint -- which of the structures the shell makes visible.
 */
export interface GridParts {
	/** Whether each chunk is tinted by its level of detail. */
	readonly levels: boolean;

	/** Whether each cell keeps its own speckle, so the tiling reads. */
	readonly cells: boolean;

	/** Whether cells on a chunk boundary are marked. */
	readonly chunks: boolean;

	/** Whether cells on a face edge are marked. */
	readonly faces: boolean;
}

/** One chunk's paint in grid mode: the parts, and where this chunk sits. */
export interface GridPaint extends GridParts {
	/** How many levels coarser than the finest this chunk is drawn. */
	readonly lod: number;

	/** The finest chunk level, which is also the largest lod there is. */
	readonly finest: number;
}
