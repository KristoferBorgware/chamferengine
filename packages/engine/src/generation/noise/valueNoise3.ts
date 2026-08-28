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

	let s = 0;
	if (corners) {
		corners.fill(slot, xi, yi, zi, seed);
		const held = corners.values;
		const base = slot * 8;
		for (let c = 0; c < 8; c++) {
			const wx = c & 1 ? u : 1 - u;
			const wy = (c >> 1) & 1 ? v : 1 - v;
			const wz = c >> 2 ? w : 1 - w;
			s += wx * wy * wz * held[base + c]!;
		}
		return s * 2 - 1;
	}
	for (let c = 0; c < 8; c++) {
		const dx = c & 1;
		const dy = (c >> 1) & 1;
		const dz = (c >> 2) & 1;
		const wx = dx ? u : 1 - u;
		const wy = dy ? v : 1 - v;
		const wz = dz ? w : 1 - w;
		s += wx * wy * wz * hash3(xi + dx, yi + dy, zi + dz, seed);
	}
	return s * 2 - 1;
}
