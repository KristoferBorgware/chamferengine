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
	/** Position, normal, metres, raw and the two layers per vertex: 10 floats. */
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
 * Floats per vertex: position, normal, metres, raw, and one per layer.
 *
 * Three layers rather than two, because the surface is continentalness,
 * erosion and peaks -- and a layer with no channel of its own is a layer whose
 * curve cannot be looked at.
 */
export const PATCH_STRIDE = 11;
