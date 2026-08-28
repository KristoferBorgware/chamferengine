import { caveField } from "./caveField.js";

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
): boolean {
	if (depthBelowSurface < ceiling || depthBelowSurface > reach) return false;
	const n = caveField(x, y, z, radius, seed, scale);
	return n > -threshold && n < threshold;
}
