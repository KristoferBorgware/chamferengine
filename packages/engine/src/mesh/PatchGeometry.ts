/**
 * One patch of the planet's surface, drawn cell by cell.
 *
 * **A cell, not a square.** The lattice is what the world is made of, so a
 * preview of it is the cells themselves: each hexagon is one map cell, its
 * corners are where three cells meet, and the twelve pentagons come out as
 * pentagons without anything here saying so.
 *
 * Vertices are laid out in the patch's own flat frame -- east, up and north in
 * metres from the middle of it -- rather than on the sphere, because a patch a
 * few kilometres across is looked at from a few kilometres away and a position
 * carrying the planet's whole radius spends its `float32` on ground nobody is
 * looking at.
 *
 * Every vertex carries what the pictures need, so switching between them is a
 * uniform rather than a rebuild: the ground in metres, the field before sea
 * level was taken off it, and **both** control layers. Carrying only the one
 * being shown would make the picture a property of the mesh, and choosing a
 * picture would cost a rebuild of the thing the picture is of.
 */
export interface PatchGeometry {
	/** Position, normal, metres, raw and the four layers per vertex. */
	readonly vertices: Float32Array<ArrayBuffer>;

	/** Triangles, three indices each. */
	readonly indices: Uint32Array<ArrayBuffer>;

	/** The rim of every cell, two indices an edge, for the wireframe. */
	readonly lines: Uint32Array<ArrayBuffer>;

	/** How many cells the patch drew. */
	readonly cellCount: number;

	readonly triangleCount: number;

	/** Metres from one side of the patch to the other. */
	readonly span: number;

	/** The lowest and highest ground in it, in metres above sea level. */
	readonly lowest: number;
	readonly highest: number;

	/** What the field itself reached here, which is what the Raw picture is drawn against. */
	readonly rawLow: number;
	readonly rawHigh: number;

	/** How much of the patch stands above the water. */
	readonly landShare: number;
}

/**
 * Floats per vertex: position, normal, metres, raw, one per layer, the
 * speckle, and how far under its own surface the point sits.
 *
 * **Four layers, because a layer with no channel of its own is a layer whose
 * curve cannot be looked at.** Three of them shape the surface; the fourth is
 * the carve, which is a 3D field and so has no one value at a place -- what
 * rides here is what it read at the block this face belongs to.
 *
 * Plus the cell's own speckle, which is a fact about the cell rather than about
 * the ground, and the one thing on a preview that says where one hexagon ends
 * and the next begins where both are the same material and the same height.
 *
 * **And plus the depth, because a block is made of what its depth says.** The
 * world covers rock with a few blocks of soil and shows bare stone under that,
 * so a colour picked from the height above the sea alone paints a whole crust
 * the colour of the meadow on top of it -- which is invisible on a preview of a
 * surface and is the entire picture on a preview of a cave. A patch drawn from
 * the map alone leaves it at zero, which is the surface, and comes out exactly
 * as it did before.
 */
export const PATCH_STRIDE = 14;
