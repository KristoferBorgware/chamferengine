import type { Vec3 } from "../../math/Vec3.js";

/**
 * The shape of a patch drawn at the block grid, one column per cell.
 *
 * **At the block's level, not the map's.** The map is the terrain and says how
 * high the ground is; what the ground is *made of* is blocks, and a cliff, an
 * overhang and a floating island are all shapes in that grid rather than in the
 * map's. Drawn a hexagon per map reading there is nowhere for any of them to
 * stand.
 *
 * The polygon and the ring are asked for once, here, and read from typed arrays
 * afterwards. Both are pure functions of the address, so a mesh that recomputed
 * them would be doing the same arithmetic a second time for the same answer --
 * and the mesh is what runs while a slider is moving.
 */
export interface ColumnPatch {
	/** How many columns the patch holds. */
	readonly count: number;

	/** The lattice this is cut at: `10 * 4^level + 2` cells on the planet. */
	readonly level: number;

	/** Per column, the address it stands at, canonicalised. */
	readonly face: Int32Array;
	readonly i: Int32Array;
	readonly j: Int32Array;

	/** Per column, its unit direction. */
	readonly directions: Float64Array;

	/** Per column, how many sides it has: 6, or 5 at one of the twelve. */
	readonly degree: Uint8Array;

	/** Per column, its corners as unit directions: 18 floats, 6 corners of 3. */
	readonly corner: Float64Array;

	/**
	 * Per column, the six neighbours as indices into this patch, `-1` off it.
	 *
	 * A cell on the rim has neighbours nobody generated. `-1` says so, and the
	 * mesh draws no wall there rather than a cliff the world does not have.
	 */
	readonly ring: Int32Array;

	/** The middle of the patch, which every position is measured from. */
	readonly centre: Vec3;

	/** Whether the walk reached every cell on the planet. */
	readonly whole: boolean;
}

/** Where the patch stands and how far the walk goes. */
export interface ColumnPlace {
	/** The middle of the patch, as a unit direction. */
	readonly at: Vec3;

	/** The lattice to cut at. */
	readonly level: number;

	/** How many rings out from the middle the walk goes. */
	readonly rings: number;
}
