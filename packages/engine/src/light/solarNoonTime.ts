import { Vec3 } from "../math/Vec3.js";

/**
 * The time of day at which the sun stands highest over a direction.
 *
 * {@link sunDirection} traces a circle across the plane orthogonal to `axis`,
 * so noon at `direction` is whichever point on that circle sits nearest the
 * direction's own component in that plane. This inverts it: the same
 * `across`/`other` basis, and the angle read back with `atan2` instead of
 * walked forward with `cos`/`sin`.
 *
 * At either pole `direction` has no component off the axis, so every time of
 * day holds the sun at the same angle above the horizon and none is more
 * "noon" than another. `0` is returned there rather than a divide by zero.
 */
export function solarNoonTime(direction: Vec3, axis: Vec3): number {
	const across = (
		Math.abs(axis.y) > 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0)
	)
		.cross(axis)
		.normalize();
	const other = axis.cross(across).normalize();

	const flat = direction.sub(axis.scale(direction.dot(axis)));
	const length = flat.length();
	if (length < 1e-9) return 0;
	const level = flat.scale(1 / length);

	const angle = Math.atan2(level.dot(other), level.dot(across));
	const timeOfDay = angle / (2 * Math.PI);
	return timeOfDay - Math.floor(timeOfDay);
}
