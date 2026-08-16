import { CELL_CONSTANT } from "./CELL_CONSTANT.js";

/**
 * The narrowest cell on the sphere, against the nominal spacing.
 *
 * Cell spacing varies 1.41:1 across a face, and the tightest cells sit at the
 * twelve pentagons.
 */
const NARROWEST_CELL = 0.744;

/**
 * How many layers a crust may hold before its columns pinch shut.
 *
 * Every layer sits at a smaller radius than the one above it, and the
 * tessellation is identical at each, so a column narrows on the way down. The
 * floor is where the narrowest cell on the sphere would close.
 *
 * The radius cancels out of `(1 - 0.744) * 2^depth / K`, so this is a property
 * of the subdivision depth alone: 435 layers at depth 11, against the 64 the
 * design assumes. The layer field is 10 bits, so the address runs out at 1,024
 * and binds first below depth 13.
 */
export function maxCrustDepth(depth: number): number {
	return Math.floor(((1 - NARROWEST_CELL) * 2 ** depth) / CELL_CONSTANT);
}
