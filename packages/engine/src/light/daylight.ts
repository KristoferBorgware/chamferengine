/**
 * How lit a place is, from the angle between the sun and its own up.
 *
 * One dot product. Up is the direction from the planet's centre, so this is the
 * whole of the day and night cycle: there is no terminator to track and nothing
 * to store, because every point carries the answer in its own position.
 *
 * The two directions are unit vectors, so the dot product is the cosine of the
 * angle between them. Light fades over `softness` either side of the horizon
 * rather than switching, which is what makes a sunrise take a moment.
 */
export function daylight(
	upX: number,
	upY: number,
	upZ: number,
	sunX: number,
	sunY: number,
	sunZ: number,
	softness = 0.12,
): number {
	const cos = upX * sunX + upY * sunY + upZ * sunZ;
	return Math.min(1, Math.max(0, (cos + softness) / (2 * softness)));
}
