import { Vec3 } from "../math/Vec3.js";

/**
 * How fast the wind moves at a place, in metres a second.
 *
 * Rigid rotation, so the speed is the distance from the axis times the rate,
 * and it falls to nothing at the two points the axis comes out.
 */
export function windSpeed(
	place: Vec3,
	axis: Vec3,
	rate: number,
	radius: number,
): number {
	return axis.cross(place).length() * rate * 2 * Math.PI * radius;
}
