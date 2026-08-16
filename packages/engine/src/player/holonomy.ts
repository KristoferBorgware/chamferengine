/**
 * How far a heading turns when it is carried around a closed loop.
 *
 * `enclosedArea / R^2`. A heading carried around a loop on a sphere does not
 * come back where it started, and how far it is out depends on the area the
 * loop encloses rather than on its length or its shape.
 *
 * This is why a heading is recomputed from where the player is rather than
 * accumulated as they move: an accumulated one drifts by exactly this much and
 * there is no error to find, because nothing went wrong.
 */
export function holonomy(enclosedArea: number, radius: number): number {
	return enclosedArea / (radius * radius);
}
