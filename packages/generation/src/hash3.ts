/** `2^32`, the divisor that turns a `uint32` into a fraction of one. */
const U32 = 4294967296;

/**
 * Three integer coordinates and a seed, mixed into a value in `[0, 1)`.
 *
 * Every step is `uint32`: a wrapping multiply, an xor, a logical shift. There
 * are no signed intermediates and no product runs past `2^53`, so there is
 * nothing here for one language to round differently from another. Two clients
 * generating the same planet compare these results.
 *
 * `Math.imul` is the wrapping multiply. The `>>> 0` after each step is what
 * keeps the value unsigned, and leaving one out is a real bug rather than a
 * type error.
 *
 * A seed of 0 contributes nothing, so the unseeded function is the seeded one
 * at its origin rather than a different function.
 */
export function hash3(x: number, y: number, z: number, seed: number): number {
	let h =
		(Math.imul(x | 0, 374761393) +
			Math.imul(y | 0, 668265263) +
			Math.imul(z | 0, 1274126177) +
			Math.imul(seed | 0, 1013904223)) >>>
		0;
	h = (h ^ (h >>> 13)) >>> 0;
	h = Math.imul(h, 1274126177) >>> 0;
	h = (h ^ (h >>> 16)) >>> 0;
	return h / U32;
}
