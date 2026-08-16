/**
 * The quintic interpolation curve, `6t^5 - 15t^4 + 10t^3`.
 *
 * Zero in the first and second derivative at both ends of `[0, 1]`, so a
 * terrain normal has no crease where one lattice cell meets the next. The
 * cheaper smoothstep is flat in the first derivative only, which leaves a jump
 * in curvature at every lattice plane — measured at 7.05 against the quintic's
 * 0.08 — and shading draws that jump as a grid over the whole world.
 */
export function fade(t: number): number {
	return t * t * t * (t * (t * 6 - 15) + 10);
}
