import type { NoiseCorners } from "./NoiseCorners.js";
import { fade } from "./fade.js";
import { hash3 } from "./hash3.js";

/**
 * Trilinear value noise at a point in space, in `[-1, 1]`.
 *
 * The eight corners of the lattice cell containing the point are hashed, and
 * the point's position within the cell is faded before it is used to weight
 * them. Fading the weight rather than the value is what makes the result smooth
 * across a cell boundary instead of merely continuous.
 *
 * **The hashing is the whole cost**, so a caller that reads many points inside
 * one cell may hand in a {@link NoiseCorners} and the slot to keep them in.
 * It changes no answer: the cache checks the cell and the seed, and a miss
 * hashes exactly what this would have hashed anyway.
 */
export function valueNoise3(
	px: number,
	py: number,
	pz: number,
	seed: number,
	corners: NoiseCorners | null = null,
	slot = 0,
): number {
	const xi = Math.floor(px);
	const yi = Math.floor(py);
	const zi = Math.floor(pz);
	const u = fade(px - xi);
	const v = fade(py - yi);
	const w = fade(pz - zi);

	// **The eight products written out, in the order the loop summed them.**
	// Every multiply and every add is where it was, so this is the same number
	// to the bit -- checked over 200,000 real readings
	// (`tools/trial-noise-blend.ts`) -- and it is `56%` of the loop's time.
	// What goes is the loop itself, the bit twiddling that recovered each
	// corner's offsets, the three ternaries choosing a weight, and `1 - u`
	// being worked out four times over.
	//
	// **Seven nested lerps are no faster than this and are a different
	// world.** They are the same value in exact arithmetic and a last bit away
	// in this one: `47.4%` of readings identical, `8.9e-16` at worst. Measured
	// at `13.1 ns` against this form's `13.0`, so the change buys nothing and
	// costs every world its ground.
	const nu = 1 - u;
	const nv = 1 - v;
	const nw = 1 - w;
	if (corners) {
		corners.fill(slot, xi, yi, zi, seed);
		const held = corners.values;
		const base = slot * 8;
		let s = nu * nv * nw * held[base]!;
		s += u * nv * nw * held[base + 1]!;
		s += nu * v * nw * held[base + 2]!;
		s += u * v * nw * held[base + 3]!;
		s += nu * nv * w * held[base + 4]!;
		s += u * nv * w * held[base + 5]!;
		s += nu * v * w * held[base + 6]!;
		s += u * v * w * held[base + 7]!;
		return s * 2 - 1;
	}
	let s = nu * nv * nw * hash3(xi, yi, zi, seed);
	s += u * nv * nw * hash3(xi + 1, yi, zi, seed);
	s += nu * v * nw * hash3(xi, yi + 1, zi, seed);
	s += u * v * nw * hash3(xi + 1, yi + 1, zi, seed);
	s += nu * nv * w * hash3(xi, yi, zi + 1, seed);
	s += u * nv * w * hash3(xi + 1, yi, zi + 1, seed);
	s += nu * v * w * hash3(xi, yi + 1, zi + 1, seed);
	s += u * v * w * hash3(xi + 1, yi + 1, zi + 1, seed);
	return s * 2 - 1;
}
