/**
 * How much of a picture has to be there for its pixel to be drawn.
 *
 * Half, which is where a box filter down the mip chain puts the edge of a
 * shape that covered half its texels -- so one threshold reads the same shape
 * at every distance, once the bake has rescaled each level's alpha to hold its
 * own coverage. Higher thins a canopy as it recedes; lower fattens every leaf
 * into a blob.
 *
 * **One number for the picture and for the shadow.** The world pass decides
 * where a leaf is and the sun's own pass decides where its shadow is, and two
 * thresholds would put a hole in one and not the other -- a tree lit through
 * gaps its shadow does not have.
 */
export const ALPHA_CUT = 0.5;
