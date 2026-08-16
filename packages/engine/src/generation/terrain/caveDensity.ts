import { fbm } from "../noise/fbm.js";

/** Offset from the world seed, so caves and surface detail differ. */
const CAVE_SEED_OFFSET = 2;

/**
 * Whether a point inside the crust is hollow.
 *
 * The noise is sampled in world space, at the point's own radius, so a passage
 * runs through the rock rather than following the surface. Open where the field
 * sits near zero, which carves sheets that connect into a network instead of
 * isolated bubbles.
 *
 * A passage only becomes an enclosed void when the noise gradient — amplitude
 * over feature size — exceeds 1. Raising the amplitude without raising the
 * frequency roughens the surface and produces no caves at all.
 *
 * Nothing opens within `ceiling` metres of the surface, so a passage reaching
 * daylight does it through a mouth in a hillside rather than by removing the
 * ground under a player's feet.
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
): boolean {
	if (depthBelowSurface < ceiling) return false;
	const f = 1 / scale;
	const n = fbm(
		x * radius * f,
		y * radius * f,
		z * radius * f,
		1,
		3,
		(seed + CAVE_SEED_OFFSET) | 0,
	);
	return n > -threshold && n < threshold;
}
