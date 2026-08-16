import { fade } from "./fade.js";
import { hash3 } from "./hash3.js";

/**
 * Trilinear value noise at a point in space, in `[-1, 1]`.
 *
 * The eight corners of the lattice cell containing the point are hashed, and
 * the point's position within the cell is faded before it is used to weight
 * them. Fading the weight rather than the value is what makes the result smooth
 * across a cell boundary instead of merely continuous.
 */
export function valueNoise3(
	px: number,
	py: number,
	pz: number,
	seed: number,
): number {
	const xi = Math.floor(px);
	const yi = Math.floor(py);
	const zi = Math.floor(pz);
	const u = fade(px - xi);
	const v = fade(py - yi);
	const w = fade(pz - zi);

	let s = 0;
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
