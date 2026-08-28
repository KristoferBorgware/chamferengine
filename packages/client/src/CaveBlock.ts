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

/**
 * The most blocks a patch is ever walked and drawn, columns times layers.
 *
 * **Two sliders multiply, and neither of them alone is the bill.** How wide the
 * patch is, how finely it is cut and how far the caves reach are three knobs
 * over one number, and a reader who moves them one at a time never sees the
 * product -- 60,000 columns at 512 layers is **thirty million** blocks, and the
 * mesh those blocks make is what runs out of memory rather than the walk.
 *
 * **Measured at `0.30` triangles a block** over the shipped world, from the two
 * settings the bench has been photographed at: `12,481` columns of `28` layers
 * drew `113,460` triangles, and the same patch at `64` layers drew `235,086`.
 * A triangle is three vertices of {@link PATCH_STRIDE} floats, so `180` bytes,
 * and the buffer doubles as it grows -- thirty million blocks is nine million
 * triangles, **1.6 GB**, and twice that while it is growing. Two million is
 * `600,000` triangles and about `108 MB`, which is the largest the page has
 * been seen to hold comfortably.
 *
 * The cap is real rather than advisory: the walk takes as many layers as the
 * product allows and the readout says how deep it went, so a slider asking for
 * more than this gets less and says so.
 */
export const MAX_CAVE_BLOCKS = 2_000_000;
