import type { Geographic } from "./Geographic.js";
import { MERIDIAN_VERTEX, NORTH } from "../addressing/solid/polarAxis.js";
import { VERTICES } from "../addressing/solid/icosahedron.js";
import { Vec3 } from "../math/Vec3.js";

/**
 * The position a latitude, longitude and altitude names.
 *
 * The inverse of {@link geographicOf}, built from the same axis and the same
 * meridian, so a place read off and typed back in comes out where it started.
 */
export function positionOf(place: Geographic, surfaceRadius: number): Vec3 {
	const meridian = VERTICES[MERIDIAN_VERTEX]!;
	const east = NORTH.cross(meridian).normalize();
	const prime = east.cross(NORTH).normalize();

	const lat = (place.latitude * Math.PI) / 180;
	const lon = (place.longitude * Math.PI) / 180;
	const ring = Math.cos(lat);

	return prime
		.scale(ring * Math.cos(lon))
		.add(east.scale(ring * Math.sin(lon)))
		.add(NORTH.scale(Math.sin(lat)))
		.normalize()
		.scale(surfaceRadius + place.altitude);
}
