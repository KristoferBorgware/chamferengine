/**
 * One patch of the world as blocks, one byte each.
 *
 * **Four kinds and not two.** Air and cave are both empty, and they are kept
 * apart because the two views draw opposite halves of the world and because a
 * cave that has broken through to the sky is a mouth worth counting. What the
 * cliffs-and-overhangs layer took is a third thing again: it is also empty, it
 * is also under the ground the map drew, and it is not a cave -- charging its
 * blocks to the caves would make every cave number a number about two layers.
 */
export const AIR = 0;
export const ROCK = 1;
export const VOID = 2;
export const CUT = 3;

/**
 * The most block layers a column is ever walked.
 *
 * A passage may be at any depth, so the walk is one field reading a block and
 * there is no fill to fall back on -- which is what makes the depth a knob
 * rather than the world's own crust. This is the ceiling on that knob however
 * small the blocks get.
 */
export const MAX_CAVE_LAYERS = 512;
