import type { NoiseCorners } from "../noise/NoiseCorners.js";
import { caveField, caveFieldSeed } from "./caveField.js";
import { valueNoise3 } from "../noise/valueNoise3.js";

/**
 * The band's edge in the octave sum's own scale, before the normalising
 * division: {@link caveField} divides its three octaves by their summed
 * amplitude `1.75`, so a threshold on the field is `threshold * 1.75` on the
 * sum -- which is what lets the sum be tested before it is finished.
 */
const AMPLITUDE_TOTAL = 1.75;

/**
 * The rounding slack the early exit stands off by.
 *
 * The proof that two octaves settle a reading is exact arithmetic -- the third
 * octave is scaled by `0.25`, a power of two, so its reach really is `0.25` to
 * the bit -- but the full sum takes one more addition and one division, each
 * rounded. A hair of slack makes the shortcut refuse the readings those
 * roundings could conceivably flip, which is how the boolean stays the same
 * bits as the long way round at every point in space.
 */
const SETTLE_SLACK = 1e-9;

/**
 * Whether a point inside the crust is hollow.
 *
 * The noise is sampled in world space, at the point's own radius, so a passage
 * runs through the rock rather than following the surface. Open where the field
 * sits inside a band either side of zero.
 *
 * **The zero set of a field in space is a set of surfaces, and the band round
 * one is a slab.** So what this carves is not a network of corridors but one
 * folded sheet running through the crust, which is what the shape of every
 * cave in the world follows from: passages are wide and connected, and there
 * is no setting of `threshold` that is both narrow and joined up -- squeezed
 * to a 3-cell median the sheet shatters into `1,976` separate systems with the
 * largest holding `1.8%` of the void.
 *
 * **There is no bias term, so there is no gradient to beat.** The signed
 * density doc 08 argues -- solid where `(surfaceRadius − r) + noise × strength`
 * is positive -- is a different rule, and the *an enclosed void needs the noise
 * gradient to exceed 1* condition belongs to that one rather than to this.
 * Widening the band here widens every passage at once rather than opening more
 * of them.
 *
 * Nothing opens within `ceiling` metres of the surface, so a passage reaching
 * daylight does it through a mouth in a hillside rather than by removing the
 * ground under a player's feet. The caller decides that number per column --
 * see {@link caveCeilingAt} -- because a ceiling the same everywhere either
 * never breaks the ground or breaks it everywhere.
 *
 * **And nothing opens below `reach`, which is what makes caves affordable at
 * all.** The field is read once a *block* rather than once a column: a passage
 * is free to be at any depth, so there is nothing to work out from the ground
 * and nothing a fill can stand in for. Without a floor a column has to be
 * evaluated to the bottom of the crust -- `1,232` blocks on the shipped world
 * against about ten with caves off, which is the difference between a world
 * that builds and one that does not. It is the same shape of bound the carve
 * carries in `CARVE_REACH`, stated in metres for the same reason.
 */
export function caveDensity(
	x: number,
	y: number,
	z: number,
	radius: number,
	depthBelowSurface: number,
	seed: number,
	scale: number,
	threshold: number,
	ceiling: number,
	reach: number,
	corners: NoiseCorners | null = null,
): boolean {
	if (depthBelowSurface < ceiling || depthBelowSurface > reach) return false;
	// **The accumulation below is {@link caveField}'s own, in its own order,
	// stopped an octave early where the answer is already known.** The first
	// two octaves carry three quarters of the sum, so where they stand further
	// from the band than the whole reach of the third, that reading is rock
	// however the third comes out -- measured over the shipped world, that is
	// a third of all readings (`tools/trial-cave-stride.ts`), and the walk
	// with the memo and this exit together costs half of what the plain walk
	// did, with not one block of 780,000 moved. Only rock can be settled
	// early: the band is narrower than the third octave's reach, so no
	// two-octave reading can promise the sum stays inside it.
	const f = radius / scale;
	const px = x * f;
	const py = y * f;
	const pz = z * f;
	const caveSeed = caveFieldSeed(seed);
	let sum = valueNoise3(px, py, pz, caveSeed, corners, 0);
	sum += 0.5 * valueNoise3(px * 2, py * 2, pz * 2, caveSeed, corners, 1);
	const edge = threshold * AMPLITUDE_TOTAL;
	if (sum - edge > 0.25 + SETTLE_SLACK || sum + edge < -0.25 - SETTLE_SLACK)
		return false;
	sum += 0.25 * valueNoise3(px * 4, py * 4, pz * 4, caveSeed, corners, 2);
	const n = sum / AMPLITUDE_TOTAL;
	return n > -threshold && n < threshold;
}
