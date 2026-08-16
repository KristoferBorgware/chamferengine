import { Vec3 } from "../math/Vec3.js";

/**
 * Carry a heading from one place on the sphere to another.
 *
 * A heading is a direction along the ground, so it only means anything against
 * the ground it is standing on. Moving somewhere else changes what the ground
 * is, and the heading comes with it: take the part of it that is still
 * sideways at the new place, and make it a unit vector again.
 *
 * This is what a heading has to be instead of a stored world vector. There is
 * no global north to store one against — a continuous field of directions over
 * a whole sphere has to stop somewhere — so a heading belongs to a place and
 * travels with the player rather than being looked up.
 *
 * Falls back to any sideways direction where the move was straight through the
 * planet's centre and nothing of the old heading survives.
 */
export function transport(heading: Vec3, from: Vec3, to: Vec3): Vec3 {
	const up = to.normalize();
	const kept = heading.sub(up.scale(heading.dot(up)));
	const length = kept.length();
	if (length > 1e-9) return kept.scale(1 / length);

	const other = Math.abs(up.y) > 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
	void from;
	return other.cross(up).normalize();
}
