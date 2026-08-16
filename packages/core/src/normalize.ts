import type { Vec3 } from "./Vec3.js";

/**
 * The length of `v`.
 *
 * Written as `sqrt(x*x + y*y + z*z)`. `Math.hypot` is a library routine and
 * returns a result one ULP apart between JavaScript runtimes, while `sqrt` is
 * an IEEE 754 operation that produces the same bits everywhere. Two clients
 * generating the same planet compare these results.
 */
export function length(v: Vec3): number {
	return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/** The direction of `v`, as a unit vector. */
export function normalize(v: Vec3): Vec3 {
	const len = length(v);
	return { x: v.x / len, y: v.y / len, z: v.z / len };
}
