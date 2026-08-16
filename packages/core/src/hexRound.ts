/**
 * Round three continuous barycentric coordinates to a lattice point.
 *
 * Rounding each one on its own breaks the sum: `(4.7, 8.6, 2.7)` sums to 16 and
 * rounds to `(5, 9, 3)`, which sums to 17 and names no lattice point at all.
 * The repair recomputes whichever coordinate moved furthest from the other two,
 * because that is the one the measurement knows least about.
 *
 * The third coordinate exists for this. Two cannot detect the error.
 */
export function hexRound(
	ka: number,
	kb: number,
	kc: number,
	n: number,
): [number, number, number] {
	let ra = Math.round(ka);
	let rb = Math.round(kb);
	let rc = Math.round(kc);
	const da = Math.abs(ra - ka);
	const db = Math.abs(rb - kb);
	const dc = Math.abs(rc - kc);
	if (da > db && da > dc) ra = n - rb - rc;
	else if (db > dc) rb = n - ra - rc;
	else rc = n - ra - rb;
	return [ra, rb, rc];
}
