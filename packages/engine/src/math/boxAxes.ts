import type { Box } from "./Box.js";

/**
 * Three perpendicular unit vectors, the first one the direction given.
 *
 * A box round a chunk wants its long axis pointing down into the planet, and
 * nothing cares which way the other two face -- across a wedge every direction
 * is the same. So the caller names one and this fills in a pair.
 *
 * The pair comes from a cross product with whichever world axis the direction
 * leans on least, which keeps that product well away from zero and so keeps
 * the result well conditioned however the direction is pointing.
 */
export function boxAxes(x: number, y: number, z: number): Box["axes"] {
	const ax = Math.abs(x);
	const ay = Math.abs(y);
	const az = Math.abs(z);
	const other: [number, number, number] =
		ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
	let vx = y * other[2] - z * other[1];
	let vy = z * other[0] - x * other[2];
	let vz = x * other[1] - y * other[0];
	const length = Math.sqrt(vx * vx + vy * vy + vz * vz);
	vx /= length;
	vy /= length;
	vz /= length;
	return [
		[x, y, z],
		[vx, vy, vz],
		[y * vz - z * vy, z * vx - x * vz, x * vy - y * vx],
	];
}
