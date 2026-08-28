/**
 * One plant, already turned into blocks, as offsets from the cell it stands on.
 *
 * **The expensive half of growing a plant is rasterising it, not designing
 * it.** Walking the trunk and its branches costs about `0.5 ms`; flooding the
 * cells around every rod and every leaf ball costs `13-21 ms`, nine tenths of
 * the whole. A template is that work done once and kept: a flat list of cells
 * relative to a root, which a plant somewhere else adds its own address to.
 *
 * `di` and `dj` are steps in the **face's own lattice**, which is a regular
 * triangular one, so the same list draws the same shape wherever it lands --
 * and `cellOffset` carries it across a face edge for nothing, because a lattice
 * point is integer weights on global vertex numbers and crossing is three
 * additions.
 *
 * `dLayer` is a step in **layers**, which are counted downward from the crust
 * top -- one radius for the whole planet. So a height offset is absolute and
 * needs no conversion at all, where the rod stamp had to carry a slot between
 * two columns and convert it against each one's own ground.
 *
 * **What this gives up.** A template is a shape in **cells**; a plant used to
 * be a shape in **metres**. Cell spacing varies `1.41:1` across an icosahedron
 * face, so one template draws a tree that much wider near a face corner than at
 * a face centre -- the height is exact either way, because layers do not vary.
 * And a plant is one of a finite set rather than unique, which
 * {@link orientTemplate} buys back twelve times over for nothing.
 */
export interface PlantTemplate {
	/** How many cells the plant left. */
	readonly count: number;

	/** Per cell, its step from the root in the face's own lattice. */
	readonly di: Int16Array;
	readonly dj: Int16Array;

	/**
	 * Per cell, its layer relative to the layer the root's surface sits on.
	 *
	 * Negative is upward: a layer counts downward from the crust top, so the
	 * block resting on the ground is `-1`.
	 */
	readonly dLayer: Int16Array;

	/** Per cell, the block standing there, from the registry. */
	readonly block: Uint8Array;

	/** How tall the plant is, in metres, and how far it reaches sideways. */
	readonly height: number;
	readonly reach: number;
}
