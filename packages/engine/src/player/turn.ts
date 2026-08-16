import { Vec3 } from "../math/Vec3.js";

/**
 * Swing a heading about the ground it stands on.
 *
 * Turning happens in the plane the player is standing in, so the axis is their
 * own up and nothing about the world enters it.
 */
export function turn(heading: Vec3, up: Vec3, angle: number): Vec3 {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	return heading
		.scale(cos)
		.add(up.cross(heading).scale(sin))
		.sub(up.scale(0))
		.normalize();
}
