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
	 *
	 * A skirt is only emitted where {@link seamFloor} says a level can put its
	 * surface lower. Hung where no level disagrees it is a wall coplanar with
	 * the neighbouring chunk's cap, which the depth buffer cannot separate.
	 */
	readonly skirtCells?: number;

	/**
	 * The layer grid every level's surface caps snap to, in metres.
	 *
	 * A chunk drawn coarser rounds its surfaces to its own coarser layers, so
	 * two levels disagree about a surface the terrain placed identically and
	 * the join reads as a step. Snapping every level's top caps to the finest
	 * grid instead — the world's real block grid — makes the levels agree
	 * exactly wherever the terrain does, and the step shrinks to what the
	 * sampling genuinely changed. Zero snaps to the chunk's own grid, which
	 * is what the finest level does anyway.
	 */
	readonly surfaceGrid?: number;

	/**
	 * How deep the join beside a rim column can open, as a radius floor.
	 *
	 * On relief, two levels put a cliff's edge at horizontally different
	 * places, so their surfaces disagree by the whole cliff height at a
	 * boundary that crosses one -- far past any fixed skirt depth. Skirts
	 * reach whichever is lower: their fixed depth, or this floor. Absent, or
	 * returning `Infinity`, the fixed depth stands.
	 */
	readonly seamFloor?: (face: number, i: number, j: number) => number;

	/**
	 * Whether to paint the seams instead of hiding them.
	 *
	 * Face-edge cells turn yellow, cells on a chunk boundary blue, and apron
	 * cells orange, so where the joins run — and which kind each one is — can
	 * be read off the ground itself. A debugging aid, off everywhere by
	 * default.
	 */
	readonly debugSeams?: boolean;
}

export const MESH_DEFAULTS = {
	crustFloor: false,
	skirtCells: 0,
	surfaceGrid: 0,
	debugSeams: false,
} as const satisfies MeshOptions;
