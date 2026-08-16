/** A lattice point split into the route down the triangles and what is left over. */
export interface PathSplit {
	/** One quaternary digit per level, naming the child triangle taken. */
	readonly path: number[];
	/** The remaining offset inside the chunk triangle. */
	readonly q: number;
	readonly r: number;
	/** 1 when an odd number of middle children were taken on the way down. */
	readonly flip: number;
}

/**
 * Walk `(i, j)` down `levels` subdivisions, emitting one digit per level.
 *
 * Digit 3 is the middle child, and taking it negates both axes. That is a half
 * turn: the determinant stays `+1`, handedness never changes, and no mirroring
 * happens anywhere. `flip` counts those turns modulo two, because a direction
 * read off `(q, r)` inside a flipped chunk is rotated by three.
 */
export function splitPath(
	i: number,
	j: number,
	depth: number,
	levels: number,
): PathSplit {
	let n = 1 << depth;
	let x = i;
	let y = j;
	let flip = 0;
	const path: number[] = [];
	for (let l = 0; l < levels; l++) {
		const half = n >> 1;
		let d: number;
		if (x >= half) {
			d = 1;
			x -= half;
		} else if (y >= half) {
			d = 2;
			y -= half;
		} else if (x + y < half) {
			d = 0;
		} else {
			d = 3;
			x = half - x;
			y = half - y;
			flip ^= 1;
		}
		path.push(d);
		n = half;
	}
	return { path, q: x, r: y, flip };
}
