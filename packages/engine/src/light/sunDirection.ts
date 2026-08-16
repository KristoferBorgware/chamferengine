import { Vec3 } from "../math/Vec3.js";

/**
 * Where the sun is at a moment of the day, as a unit direction.
 *
 * The sun travels a circle about the axis, keeping a fixed angle to it. Both are
 * world directions and neither depends on where a player is standing.
 *
 * `tilt` is the angle it keeps. At zero the sun crosses the plane through the
 * planet's middle, every place off the axis gets a full day and night, and the
 * two poles sit on the line between the two and stay there. Leaning it puts one
 * pole in daylight the whole day and the other in the dark, which is what a
 * fixed lean does without a year to turn it round.
 *
 * This is display, not generated world, so the trigonometry here is free of the
 * rule that keeps transcendentals out of anything two clients compare.
 */
export function sunDirection(timeOfDay: number, axis: Vec3, tilt = 0): Vec3 {
	// Any direction across the axis, to swing the sun around it.
	const across = (
		Math.abs(axis.y) > 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0)
	)
		.cross(axis)
		.normalize();
	const other = axis.cross(across).normalize();
	const angle = timeOfDay * 2 * Math.PI;
	return across
		.scale(Math.cos(angle))
		.add(other.scale(Math.sin(angle)))
		.scale(Math.cos(tilt))
		.add(axis.scale(Math.sin(tilt)))
		.normalize();
}
