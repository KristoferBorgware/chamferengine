import type { Vec3 } from "../math/Vec3.js";
import { MERIDIAN_VERTEX, NORTH } from "../addressing/solid/polarAxis.js";
import { VERTICES } from "../addressing/solid/icosahedron.js";

/** The three axes of a place: out of the ground, toward the east, toward the north. */
export interface LocalFrame {
	readonly up: Vec3;
	readonly east: Vec3;
	readonly north: Vec3;
}

/**
 * The local frame at a unit direction.
 *
 * East is the axis crossed with up -- the direction of increasing longitude --
 * and north completes the right-handed set. At the two poles east is
 * undefined, so the frame there is taken against the prime meridian's own
 * vertex instead; every heading at a pole is south, and the choice only
 * decides which south.
 */
export function frameOf(up: Vec3): LocalFrame {
	let east = NORTH.cross(up);
	if (east.length() < 1e-9) east = VERTICES[MERIDIAN_VERTEX]!.cross(up);
	east = east.normalize();
	return { up, east, north: up.cross(east).normalize() };
}
