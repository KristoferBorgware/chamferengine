import type { Geographic } from "./Geographic.js";
import type { Vec3 } from "../math/Vec3.js";
import { MERIDIAN_VERTEX, NORTH } from "../addressing/solid/polarAxis.js";
import { VERTICES } from "../addressing/solid/icosahedron.js";

/**
 * Where a position is, in latitude, longitude and altitude.
 *
 * The axis runs through icosahedron vertices 0 and 3 and the prime meridian
 * through vertex 11. All six antipodal pentagon pairs give the same world seen
 * from a different angle, so the choice cannot be made on merit; it is settled
 * on the face table, where `0`-`3` is the only pair whose polar caps are
 * contiguous runs of face indices. Changing any of the three moves every
 * coordinate ever shared.
 *
 * The east direction is built from the meridian rather than from a world axis,
 * so nothing here depends on which way the planet happens to sit in space.
 */
export function geographicOf(
	position: Vec3,
	surfaceRadius: number,
): Geographic {
	const radius = position.length();
	const direction = position.scale(1 / radius);

	const meridian = VERTICES[MERIDIAN_VERTEX]!;
	const east = NORTH.cross(meridian).normalize();
	const prime = east.cross(NORTH).normalize();

	const up = direction.dot(NORTH);
	return {
		latitude: (Math.asin(Math.min(1, Math.max(-1, up))) * 180) / Math.PI,
		longitude:
			(Math.atan2(direction.dot(east), direction.dot(prime)) * 180) /
			Math.PI,
		altitude: radius - surfaceRadius,
	};
}
