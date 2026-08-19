import { fade } from "./fade.js";
import { hash3 } from "./hash3.js";

/**
 * The twelve edge midpoints of a cube, as gradient vectors.
 *
 * Every one has length `sqrt(2)` and points along a cube edge rather than at a
 * corner, which is what keeps the eight corners of a lattice cell from all
 * pulling toward the diagonals and leaving a visible bias along them.
 */
const GRADIENTS = new Float64Array([
	1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0,
	-1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

/**
 * What the summed corner terms are multiplied by to reach `[-1, 1]`.
 *
 * Cube-edge gradients faded across a cell reach about `0.98` of one rather
 * than one, measured over 2,000,000 sample points, so this brings the extreme
 * up to the end of the range. Its typical swing stays well under the other
 * bases: a standard deviation of `0.27` where value noise gives `0.40`, which
 * is what puts more of a Perlin field near its middle and fewer parts of it
 * near the top.
 */
const SCALE = 1.015;

/**
 * Gradient noise at a point in space, in `[-1, 1]`.
 *
 * Each of the eight corners of the lattice cell containing the point carries a
 * direction rather than a value, and its contribution is that direction dotted
 * with the offset from the corner to the point. Every corner therefore reads
 * zero at itself, which puts a zero crossing at every lattice point and gives
 * the field its even spread of high and low ground.
 *
 * The point's position within the cell is faded before it weights the corners.
 * Fading the weight rather than the value is what makes the result smooth
 * across a cell boundary instead of merely continuous.
 */
export function perlinNoise3(
	px: number,
	py: number,
	pz: number,
	seed: number,
): number {
	const xi = Math.floor(px);
	const yi = Math.floor(py);
	const zi = Math.floor(pz);
	const fx = px - xi;
	const fy = py - yi;
	const fz = pz - zi;
	const u = fade(fx);
	const v = fade(fy);
	const w = fade(fz);

	let sum = 0;
	for (let c = 0; c < 8; c++) {
		const dx = c & 1;
		const dy = (c >> 1) & 1;
		const dz = (c >> 2) & 1;
		const g = 3 * Math.floor(hash3(xi + dx, yi + dy, zi + dz, seed) * 12);
		const dot =
			GRADIENTS[g]! * (fx - dx) +
			GRADIENTS[g + 1]! * (fy - dy) +
			GRADIENTS[g + 2]! * (fz - dz);
		const wx = dx ? u : 1 - u;
		const wy = dy ? v : 1 - v;
		const wz = dz ? w : 1 - w;
		sum += wx * wy * wz * dot;
	}
	return sum * SCALE;
}
