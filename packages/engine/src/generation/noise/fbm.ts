import type { NoiseCorners } from "./NoiseCorners.js";
import { valueNoise3 } from "./valueNoise3.js";

/**
 * Fractional Brownian motion: octaves of {@link valueNoise3} at lacunarity 2
 * and gain 0.5, in `[-1, 1]`.
 *
 * Two things about the loop are fixed rather than incidental.
 *
 * Octaves accumulate **low frequency first**. Floating-point addition is not
 * associative, so summing them the other way round moves the result — by
 * `1.4e-17` at four and five octaves, and by nothing at all at six and eight.
 * An error that appears at some octave counts and not others is the kind
 * testing never finds.
 *
 * The sum is divided by the **total amplitude**, which makes the octave count a
 * control over shape rather than over gain: adding an octave adds detail
 * without making the world taller.
 *
 * The result is bounded by `[-1, 1]` and does not fill it. Over 200,000
 * directions the standard deviation is `0.244` of the amplitude, so a stated
 * relief of 60 m is a typical swing of about 15 m, reaching 60 only where
 * several octaves happen to align.
 *
 * **`corners` is a memo and never an answer**, one slot per octave from
 * `slot`: {@link valueNoise3} checks the cell and the seed before trusting a
 * slot, so a caller reading points in any order gets the bits it would have
 * got with no cache at all. What it is for is a walk down a column, where the
 * sample point crosses a lattice cell of the widest octave once in dozens of
 * readings and the hashes are the whole cost.
 */
export function fbm(
	x: number,
	y: number,
	z: number,
	frequency: number,
	octaves: number,
	seed: number,
	corners: NoiseCorners | null = null,
	slot = 0,
): number {
	let sum = 0;
	let amplitude = 1;
	let total = 0;
	let f = frequency;
	for (let o = 0; o < octaves; o++) {
		sum +=
			amplitude *
			valueNoise3(x * f, y * f, z * f, seed, corners, slot + o);
		total += amplitude;
		amplitude *= 0.5;
		f *= 2;
	}
	return sum / total;
}
