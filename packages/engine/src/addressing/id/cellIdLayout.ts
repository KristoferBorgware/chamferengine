/**
 * The stored word, most significant field first:
 *
 *     [planet 12][face 5][path 2 x depth][corner 2][layer 10]
 *
 * At depth 11 that is 51 bits, which sits inside the range `float64` represents
 * exactly, so an ID is a plain `number`. JavaScript's bitwise operators work on
 * 32 bits and would silently truncate, so every field is extracted with
 * multiply and divide instead.
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
