/**
 * One of the twelve ways a template may be laid down, as an integer transform.
 *
 * A face's lattice is triangular, so it maps to itself under a sixth turn about
 * any lattice point and under a reflection -- and both are two additions on the
 * cube coordinates `(di, dj, -(di + dj))`, which sum to zero. Twelve
 * orientations of every template, at no memory and no arithmetic worth naming,
 * against a template set that would otherwise have to be twelve times larger to
 * look as varied.
 *
 * **A mirror here is content, never addressing.** Invariant 9 is that nothing
 * in the address space is ever mirrored -- the middle-child flip is a half
 * turn, determinant `+1`, so no chirality bug is possible. This reflects the
 * *shape a plant draws*, which is a picture of a tree and has no handedness to
 * get wrong: the cells it names are found by {@link cellOffset} exactly as the
 * unreflected ones are.
 *
 * `turn` is `0` to `11`: the low three bits pick the sixth turn, the fourth
 * bit picks the mirror.
 */
export function orientTemplate(
	di: number,
	dj: number,
	turn: number,
	out: [number, number],
): void {
	let x = di;
	let y = dj;
	if (turn >= 6) {
		// Swapping two cube coordinates is the reflection: `(x, y, z)` to
		// `(x, z, y)`, and `z` is what the other two do not account for.
		y = -(x + y) | 0;
	}
	for (let step = turn % 6; step > 0; step--) {
		// A sixth turn on cube coordinates is `(x, y, z)` to `(-z, -x, -y)`.
		// **`| 0` because negating nought is not nought in a float**, and an
		// offset that reads `-0` is the same cell written a different way.
		const was = x;
		x = (x + y) | 0;
		y = -was | 0;
	}
	out[0] = x;
	out[1] = y;
}
