/**
 * The stored word, most significant field first:
 *
 *     [planet 12][face 5][path 2 x depth][corner 2][layer 11]
 *
 * `30 + 2 x depth` bits wide, reaching exactly 64 at the deepest subdivision
 * level the word can name. A `number` only counts integers exactly to 53 bits,
 * past at depth 12, so the
 * word is a {@link CellId} — two 32-bit halves — rather than one `number`.
 * `encodeCell` and `decodeCell` build and read it with `bigint`, which is
 * exact at any width and never rounds.
 */
export const PLANET_BITS = 12;
export const FACE_BITS = 5;
export const CORNER_BITS = 2;
/**
 * How many bits name the layer.
 *
 * Eleven rather than ten, and the eleventh is the last bit the word has: at
 * depth 17 it comes to exactly 64. What it buys is the crust, which is capped
 * at whichever is smaller of the taper and this field -- 1,024 layers held a
 * 1 m block to 1,024 m of ground where the taper allowed 1,740.
 */
export const LAYER_BITS = 11;

/** How many layers the layer field addresses. */
export const LAYER_COUNT = 2 ** LAYER_BITS;

/** The three corners of a depth-`depth` triangle, as leftover offsets. */
export const CORNER_OFFSETS: readonly (readonly [number, number])[] = [
	[0, 0],
	[1, 0],
	[0, 1],
];
