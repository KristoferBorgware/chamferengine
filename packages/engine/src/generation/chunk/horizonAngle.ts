/**
 * How far around the planet a viewer can see, as an angle from directly below
 * them.
 *
 * From an altitude `h` above a sphere of radius `R` the horizon sits at
 * `acos(R / (R + h))`: 76 m at eye height on the worked planet, and most of a
 * hemisphere from orbit.
 *
 * `acos` is a transcendental, and this is presentation. Which chunks a viewer
 * is shown affects nothing two clients have to agree on, so the rule against
 * transcendentals in generated results does not reach here.
 */
export function horizonAngle(
	viewerRadius: number,
	surfaceRadius: number,
): number {
	if (viewerRadius <= surfaceRadius) return 0;
	return Math.acos(surfaceRadius / viewerRadius);
}
