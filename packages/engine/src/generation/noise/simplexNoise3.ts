import { hash3 } from "./hash3.js";

/**
 * How far a lattice point's influence reaches, squared.
 *
 * Every point inside this radius of the sample contributes and every point
 * outside it contributes nothing, which is what keeps the count of terms at
 * four per lattice copy however the sample sits.
 */
const RADIUS_SQUARED = 0.6;

/**
 * The rotation that turns two offset cubic lattices into one BCC lattice.
 *
 * Reflecting each axis through `(2/3)(x + y + z)` is an orthonormal rotation,
 * not a skew, so distances are unchanged and the lattice comes out isotropic:
 * the axis grain a cubic lattice puts into a field has nowhere to sit.
 */
const ROTATE = 2 / 3;

/**
 * What the summed kernel is divided by to reach `[-1, 1]`.
 *
 * The gradients below are stated at the reference implementation's own lengths
 * and this is the reference implementation's own normaliser.
 */
const NORMALIZER = 0.07969837668935331;

/** Mixed into the seed for the second lattice copy, so the two do not repeat. */
const LATTICE_FLIP = 0x5e2b6c31;

/**
 * Forty-eight gradient directions, at the lengths the reference states them.
 *
 * Three classes of direction, each a permutation family: `(+-2.22, +-2.22,
 * +-1)`, `(+-3.09, +-1.17, 0)` and their coordinate permutations. They are not
 * unit vectors -- the set is chosen so the sum over the four contributing
 * points has an even spread rather than so each term is bounded.
 */
const GRADIENTS = new Float64Array([
	2.22474487139, 2.22474487139, -1.0, 2.22474487139, 2.22474487139, 1.0,
	3.0862664687972017, 1.1721513422464978, 0.0, 1.1721513422464978,
	3.0862664687972017, 0.0, -2.22474487139, 2.22474487139, -1.0,
	-2.22474487139, 2.22474487139, 1.0, -1.1721513422464978, 3.0862664687972017,
	0.0, -3.0862664687972017, 1.1721513422464978, 0.0, -1.0, -2.22474487139,
	-2.22474487139, 1.0, -2.22474487139, -2.22474487139, 0.0,
	-3.0862664687972017, -1.1721513422464978, 0.0, -1.1721513422464978,
	-3.0862664687972017, -1.0, -2.22474487139, 2.22474487139, 1.0,
	-2.22474487139, 2.22474487139, 0.0, -1.1721513422464978, 3.0862664687972017,
	0.0, -3.0862664687972017, 1.1721513422464978, -2.22474487139,
	-2.22474487139, -1.0, -2.22474487139, -2.22474487139, 1.0,
	-3.0862664687972017, -1.1721513422464978, 0.0, -1.1721513422464978,
	-3.0862664687972017, 0.0, -2.22474487139, -1.0, -2.22474487139,
	-2.22474487139, 1.0, -2.22474487139, -1.1721513422464978, 0.0,
	-3.0862664687972017, -3.0862664687972017, 0.0, -1.1721513422464978,
	-2.22474487139, -1.0, 2.22474487139, -2.22474487139, 1.0, 2.22474487139,
	-3.0862664687972017, 0.0, 1.1721513422464978, -1.1721513422464978, 0.0,
	3.0862664687972017, -1.0, 2.22474487139, -2.22474487139, 1.0, 2.22474487139,
	-2.22474487139, 0.0, 1.1721513422464978, -3.0862664687972017, 0.0,
	3.0862664687972017, -1.1721513422464978, -1.0, 2.22474487139, 2.22474487139,
	1.0, 2.22474487139, 2.22474487139, 0.0, 3.0862664687972017,
	1.1721513422464978, 0.0, 1.1721513422464978, 3.0862664687972017,
	2.22474487139, -2.22474487139, -1.0, 2.22474487139, -2.22474487139, 1.0,
	1.1721513422464978, -3.0862664687972017, 0.0, 3.0862664687972017,
	-1.1721513422464978, 0.0, 2.22474487139, -1.0, -2.22474487139,
	2.22474487139, 1.0, -2.22474487139, 3.0862664687972017, 0.0,
	-1.1721513422464978, 1.1721513422464978, 0.0, -3.0862664687972017,
	2.22474487139, -1.0, 2.22474487139, 2.22474487139, 1.0, 2.22474487139,
	1.1721513422464978, 0.0, 3.0862664687972017, 3.0862664687972017, 0.0,
	1.1721513422464978,
]);
for (let i = 0; i < GRADIENTS.length; i++) GRADIENTS[i]! /= NORMALIZER;

/**
 * OpenSimplex2 noise at a point in space, in `[-1, 1]`.
 *
 * Two cubic lattices half a cell apart form a body-centred cubic lattice, and
 * the whole thing is rotated so neither of them lines up with the coordinate
 * axes. A sample reads the four nearest points of each copy, weights each by
 * `(r^2 - d^2)^4` and adds the gradient dotted with the offset to it. Points
 * further than the radius drop out, which is why the count of terms is fixed.
 *
 * What this gives over noise on a plain cubic lattice is the absence of an
 * axis grain: a cubic lattice has its cell diagonals longer than its edges, so
 * features stretch along the diagonals and a large flat region shows a faint
 * square weave. The BCC lattice is the densest packing in three dimensions and
 * has no such direction.
 *
 * The gradient at a lattice point is chosen by the same integer hash the rest
 * of the noise here uses, indexing the forty-eight directions above. The
 * reference picks it with a 64-bit multiply, which is several operations in a
 * runtime whose integers are 32 bits wide and whose numbers are doubles.
 */
export function simplexNoise3(
	px: number,
	py: number,
	pz: number,
	seed: number,
): number {
	const r = ROTATE * (px + py + pz);
	let xr = r - px;
	let yr = r - py;
	let zr = r - pz;

	// The nearest lattice point, and where the sample sits relative to it.
	let xb = Math.floor(xr + 0.5);
	let yb = Math.floor(yr + 0.5);
	let zb = Math.floor(zr + 0.5);
	let xi = xr - xb;
	let yi = yr - yb;
	let zi = zr - zb;

	// -1 where the sample is on the positive side of the point, 1 where it is
	// on the negative side. Multiplying by the offset gives its absolute value.
	let xs = Math.trunc(-1 - xi) | 1;
	let ys = Math.trunc(-1 - yi) | 1;
	let zs = Math.trunc(-1 - zi) | 1;
	let ax = xs * -xi;
	let ay = ys * -yi;
	let az = zs * -zi;

	let value = 0;
	let a = RADIUS_SQUARED - xi * xi - (yi * yi + zi * zi);
	let lattice = seed | 0;
	for (let copy = 0; ; copy++) {
		if (a > 0)
			value += a * a * a * a * grad(lattice, xb, yb, zb, xi, yi, zi);

		// The second-nearest point is one step along whichever axis the sample
		// leans furthest down. Only that one can be inside the radius.
		if (ax >= ay && ax >= az) {
			let b = a + ax + ax;
			if (b > 1) {
				b -= 1;
				value +=
					b *
					b *
					b *
					b *
					grad(lattice, xb - xs, yb, zb, xi + xs, yi, zi);
			}
		} else if (ay > ax && ay >= az) {
			let b = a + ay + ay;
			if (b > 1) {
				b -= 1;
				value +=
					b *
					b *
					b *
					b *
					grad(lattice, xb, yb - ys, zb, xi, yi + ys, zi);
			}
		} else {
			let b = a + az + az;
			if (b > 1) {
				b -= 1;
				value +=
					b *
					b *
					b *
					b *
					grad(lattice, xb, yb, zb - zs, xi, yi, zi + zs);
			}
		}

		if (copy === 1) break;

		// Step to the other lattice copy, half a cell away along every axis.
		ax = 0.5 - ax;
		ay = 0.5 - ay;
		az = 0.5 - az;
		xi = xs * ax;
		yi = ys * ay;
		zi = zs * az;
		a += 0.75 - ax - (ay + az);
		xb += (xs >> 1) & 1;
		yb += (ys >> 1) & 1;
		zb += (zs >> 1) & 1;
		xs = -xs;
		ys = -ys;
		zs = -zs;
		lattice = (lattice ^ LATTICE_FLIP) | 0;
	}
	return value;
}

/** One lattice point's gradient, dotted with the offset from it to the sample. */
function grad(
	seed: number,
	xb: number,
	yb: number,
	zb: number,
	dx: number,
	dy: number,
	dz: number,
): number {
	const g = 3 * Math.floor(hash3(xb, yb, zb, seed) * 48);
	return GRADIENTS[g]! * dx + GRADIENTS[g + 1]! * dy + GRADIENTS[g + 2]! * dz;
}
