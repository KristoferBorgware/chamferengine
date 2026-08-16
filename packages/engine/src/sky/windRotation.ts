import { Vec3 } from "../math/Vec3.js";

/**
 * Turn a direction about an axis, which is how wind moves a cloud.
 *
 * The sample point is rotated before the noise is read rather than the noise
 * being moved, so the pattern travels and nothing about it is stretched.
 *
 * Rodrigues' rotation. The trigonometry is display work, so the rule keeping
 * transcendentals out of anything two clients compare does not reach here.
 */
export function windRotation(point: Vec3, axis: Vec3, angle: number): Vec3 {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	return point
		.scale(cos)
		.add(axis.cross(point).scale(sin))
		.add(axis.scale(axis.dot(point) * (1 - cos)));
}
