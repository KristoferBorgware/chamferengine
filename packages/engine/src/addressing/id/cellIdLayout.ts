/**
 * The stored word, most significant field first:
 *
 *     [planet 12][face 5][path 2 x depth][corner 2][layer 10]
 *
 * `29 + 2 x depth` bits wide, reaching 63 at the deepest subdivision level. A
 * `number` only counts integers exactly to 53 bits, past at depth 13, so the
 * word is a {@link CellId} — two 32-bit halves — rather than one `number`.
 * `encodeCell` and `decodeCell` build and read it with `bigint`, which is
 * exact at any width and never rounds.
 */
export const PLANET_BITS = 12;
export const FACE_BITS = 5;
export const CORNER_BITS = 2;
export const LAYER_BITS = 10;

/** How many layers the layer field addresses. */
export const LAYER_COUNT = 2 ** LAYER_BITS;

/** The three corners of a depth-`depth` triangle, as leftover offsets. */
export const CORNER_OFFSETS: readonly (readonly [number, number])[] = [
	[0, 0],
	[1, 0],
	[0, 1],
];
