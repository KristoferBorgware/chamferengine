import type { GridPaint } from "./GridPaint.js";

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
	 * Whether a chunk also draws the ring of cells just beyond its rim.
	 *
	 * Two chunks drawn at different levels tile their shared boundary with
	 * hexagons of two sizes, and those do not interlock: strips of ground have
	 * their containing cell centred across the line, at a lattice the chunk
	 * over there does not use, so neither side's own cells cover them. Each
	 * chunk closes its own side by drawing one cell further out, a centimetre
	 * low so a real cell wins wherever one exists.
	 *
	 * This replaced the skirt -- a wall hung from every rim in case a level
	 * disagreed. A skirt hangs from the cap plane, so wherever no level
	 * actually disagreed it was coplanar with the neighbouring chunk's cap and
	 * speckled through it as a dashed dark line along every chunk boundary.
	 * Measured against the apron: over 3,899 rays outward and 1,446 grazing
	 * rays into the terrain across a mixed-level scene, removing skirts opened
	 * **no hole and no crack**, because the apron overlaps the join and the cap
	 * steps wall every drop between neighbours.
	 */
	readonly apron?: boolean;

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
	 * Whether to paint the seams instead of hiding them.
	 *
	 * Face-edge cells turn yellow, cells on a chunk boundary blue, and apron
	 * cells orange, so where the joins run — and which kind each one is — can
	 * be read off the ground itself. A debugging aid, off everywhere by
	 * default.
	 */
	readonly debugSeams?: boolean;

	/**
	 * Paint the world as its own grid instead of as terrain.
	 *
	 * Cells take the chunk's level-of-detail color rather than a block's, and
	 * the seam tints mark chunk boundaries and face edges under their own
	 * switches. The blocks still decide the geometry -- grid mode feeds the
	 * mesher a flat shell, and this is how that shell is painted.
	 */
	readonly grid?: GridPaint | undefined;
}

export const MESH_DEFAULTS = {
	crustFloor: false,
	apron: false,
	surfaceGrid: 0,
	debugSeams: false,
} as const satisfies MeshOptions;
