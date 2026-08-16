import type { Landmark } from "./Landmark.js";
import type { Vec3 } from "../math/Vec3.js";
import { NORTH_VERTEX, SOUTH_VERTEX } from "../addressing/solid/polarAxis.js";
import { VERTICES } from "../addressing/solid/icosahedron.js";
import { geographicOf } from "./geographicOf.js";

/**
 * The twelve pentagons, named.
 *
 * Every world has exactly twelve, one per icosahedron vertex, at every
 * subdivision level. Two of them are the coordinate poles. The other ten sit on
 * two rings at latitudes of `atan(1/2)` either side of the middle, and all
 * twelve land on exact multiples of 36 degrees of longitude.
 *
 * They are far enough apart to be a journey and close enough to be a network:
 * 1,882 m between neighbours on a 1,700 m planet, and nowhere is more than
 * 1,109 m from one.
 */
export function landmarks(): Landmark[] {
	const out: Landmark[] = [];
	for (let vertex = 0; vertex < VERTICES.length; vertex++) {
		const direction = VERTICES[vertex]!;
		out.push({ name: nameOf(vertex, direction), direction, vertex });
	}
	return out;
}

/** What to call a pentagon: the two poles by name, the rest by where they sit. */
function nameOf(vertex: number, direction: Vec3): string {
	if (vertex === NORTH_VERTEX) return "north pole";
	if (vertex === SOUTH_VERTEX) return "south pole";
	const place = geographicOf(direction, 1);
	const side = place.latitude > 0 ? "north" : "south";
	const east = Math.round(place.longitude);
	return `${side} ${east >= 0 ? east : east + 360}`;
}
