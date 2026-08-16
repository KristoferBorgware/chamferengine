/**
 * How many layers down from the crust top a radius sits.
 *
 * `surfaceRadius` is the planet's reference radius, not the terrain height at
 * this direction. The radial axis never interacts with the horizontal one, so
 * this is independent of everything above.
 */
export function layerOf(
	radius: number,
	surfaceRadius: number,
	blockSize: number,
): number {
	return Math.floor((surfaceRadius - radius) / blockSize);
}
