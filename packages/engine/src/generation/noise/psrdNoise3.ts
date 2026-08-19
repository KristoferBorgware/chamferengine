/** How many distinct values the permutation polynomial can return. */
const PERIOD = 289;

/**
 * The permutation table's own turn per index, and the tilt of the second
 * rotation axis, both as the reference states them.
 *
 * A gradient is built from a hashed index rather than looked up: the index
 * picks a point on the unit sphere through an angle and a height, and a second
 * angle picks the axis the gradient turns about when `spin` is not zero.
 */
const THETA_PER_INDEX = 3.883222077;
const SZ_PER_INDEX = -0.006920415;
const SZ_BASE = 0.996539792;
const PSI_PER_INDEX = 0.108705628;

/**
 * What the summed kernel is multiplied by, as the reference states it.
 *
 * It overshoots: measured over 2,000,000 samples the field reaches `1.030`
 * rather than `1`. Nothing downstream minds -- the metre scale divides by the
 * field's own peak, so the tallest ground is the stated relief either way.
 */
const SCALE = 39.5;

/**
 * The sine and cosine of every angle a hashed index can produce.
 *
 * There are only `289` distinct indices, so the two rotations each have `289`
 * possible angles and the whole trigonometric part of the field is these four
 * tables. Every sample reads them; none computes a sine.
 */
const COS_THETA = new Float64Array(PERIOD);
const SIN_THETA = new Float64Array(PERIOD);
const COS_PSI = new Float64Array(PERIOD);
const SIN_PSI = new Float64Array(PERIOD);
for (let i = 0; i < PERIOD; i++) {
	COS_THETA[i] = Math.cos(i * THETA_PER_INDEX);
	SIN_THETA[i] = Math.sin(i * THETA_PER_INDEX);
	COS_PSI[i] = Math.cos(i * PSI_PER_INDEX);
	SIN_PSI[i] = Math.sin(i * PSI_PER_INDEX);
}

/** Wrap into `[0, 289)`, for a coordinate of any size and either sign. */
function wrap(x: number): number {
	return x - Math.floor(x / PERIOD) * PERIOD;
}

/** The permutation polynomial, an integer in `[0, 289)` from an integer. */
function permute(x: number): number {
	const m = wrap(x);
	return wrap((m * 34 + 10) * m);
}

/**
 * Simplex noise with rotating gradients, in `[-1, 1]`.
 *
 * The simplex lattice is the cubic lattice sheared so its cells are tetrahedra
 * rather than cubes, which puts four corners around a sample in three
 * dimensions instead of eight. Each corner carries a gradient, weighted by
 * `(0.5 - d^2)^3`, and the sum is the field.
 *
 * `spinSin` and `spinCos` turn every gradient about its own second axis by one
 * shared angle. At zero the gradients sit where the hash puts them and this is
 * ordinary simplex noise. Turning them moves the lobes of every feature
 * together while leaving the lattice alone, so a field keeps its layout and
 * changes which way its slopes face -- one angle that reshapes the whole map
 * without moving a coastline's frame.
 *
 * Gradients here come from a polynomial permutation over `[0, 289)` rather
 * than from an integer hash, and the field therefore repeats every 289 lattice
 * cells. At the frequencies the octave stack reaches, a planet spans a few
 * dozen cells, so the repeat is never on screen.
 */
export function psrdNoise3(
	px: number,
	py: number,
	pz: number,
	seed: number,
	spinSin: number,
	spinCos: number,
): number {
	// Shear into the simplex lattice, where a cell is a tetrahedron.
	const ux = py + pz;
	const uy = px + pz;
	const uz = px + py;
	const i0x = Math.floor(ux);
	const i0y = Math.floor(uy);
	const i0z = Math.floor(uz);
	const f0x = ux - i0x;
	const f0y = uy - i0y;
	const f0z = uz - i0z;

	// Which of the six tetrahedra in the cell the sample fell into, as the two
	// intermediate corners between the cell's own corner and its opposite.
	const gtx = f0y >= f0x ? 1 : 0;
	const gty = f0z >= f0y ? 1 : 0;
	const gtz = f0z >= f0x ? 1 : 0;
	const ax = 1 - gtz;
	const ay = gtx;
	const az = gty;
	const bx = 1 - gtx;
	const by = 1 - gty;
	const bz = gtz;
	const o1x = Math.min(ax, bx);
	const o1y = Math.min(ay, by);
	const o1z = Math.min(az, bz);
	const o2x = Math.max(ax, bx);
	const o2y = Math.max(ay, by);
	const o2z = Math.max(az, bz);

	let sum = 0;
	sum += corner(px, py, pz, i0x, i0y, i0z, seed, spinSin, spinCos);
	sum += corner(
		px,
		py,
		pz,
		i0x + o1x,
		i0y + o1y,
		i0z + o1z,
		seed,
		spinSin,
		spinCos,
	);
	sum += corner(
		px,
		py,
		pz,
		i0x + o2x,
		i0y + o2y,
		i0z + o2z,
		seed,
		spinSin,
		spinCos,
	);
	sum += corner(
		px,
		py,
		pz,
		i0x + 1,
		i0y + 1,
		i0z + 1,
		seed,
		spinSin,
		spinCos,
	);
	return SCALE * sum;
}

/** One lattice corner's contribution, or zero when the sample is out of reach. */
function corner(
	px: number,
	py: number,
	pz: number,
	cx: number,
	cy: number,
	cz: number,
	seed: number,
	spinSin: number,
	spinCos: number,
): number {
	// Back out of the shear to find where this corner sits in space.
	const dx = px - 0.5 * (-cx + cy + cz);
	const dy = py - 0.5 * (cx - cy + cz);
	const dz = pz - 0.5 * (cx + cy - cz);

	const w = 0.5 - (dx * dx + dy * dy + dz * dz);
	if (w <= 0) return 0;

	const h = permute(permute(permute(cz + seed) + cy) + cx);
	const ct = COS_THETA[h]!;
	const st = SIN_THETA[h]!;
	const sz = h * SZ_PER_INDEX + SZ_BASE;
	const sr = Math.sqrt(1 - sz * sz);
	let gx = ct * sr;
	let gy = st * sr;
	let gz = sz;

	if (spinSin !== 0) {
		// A second unit vector at right angles to the first, so the two span
		// the plane the gradient turns in.
		const sp = SIN_PSI[h]!;
		const cp = COS_PSI[h]!;
		const ctp = st * sp - ct * cp;
		const qxa = ctp * st;
		const qya = -ctp * ct;
		const qx = qxa + sz * (sp - qxa);
		const qy = qya + sz * (cp - qya);
		const qz = -(gy * cp + gx * sp);
		gx = spinCos * gx + spinSin * qx;
		gy = spinCos * gy + spinSin * qy;
		gz = spinCos * gz + spinSin * qz;
	}

	const w3 = w * w * w;
	return w3 * (gx * dx + gy * dy + gz * dz);
}
