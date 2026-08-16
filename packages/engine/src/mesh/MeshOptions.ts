/** What a mesher draws beyond the visible surface. */
export interface MeshOptions {
	/**
	 * Whether to close the bottom of the crust.
	 *
	 * The floor sits at the last layer, 435 of them down on the worked planet,
	 * with solid ground the whole way above it. It is 34.6% of a chunk's
	 * triangles and no camera can be under it while the world has no digging in
	 * it, so it is left out and the cost model stays comparable to the surface
	 * one: 4 triangles a cell for a fully exposed cap.
	 */
	readonly crustFloor?: boolean;

	/**
	 * How far the rim of a chunk hangs below its surface, in cells.
	 *
	 * Two chunks drawn at different levels sample the terrain at different
	 * spacings, so their surfaces meet at slightly different heights and the
	 * join opens a slit. A wall hanging from the finer chunk's rim covers a
	 * slit up to its own depth.
	 *
	 * Radial boundaries agree across levels, so the slit is horizontal and a
	 * skirt is the whole of it as long as a column is one run of ground. A
	 * column with a cave in it opens a hole a skirt reaches past, and that is
	 * what seam ownership is for.
	 */
	readonly skirtCells?: number;
}

export const MESH_DEFAULTS = {
	crustFloor: false,
	skirtCells: 0,
} as const satisfies Required<MeshOptions>;
