/**
 * The scale height a planet's air would have if the atmosphere were scaled with
 * it.
 *
 * Everything about the air keeps its proportions, so the height it thins over
 * shrinks by the same factor the radius does.
 */
export function scaledScaleHeight(
	earthScaleHeight: number,
	earthRadius: number,
	radius: number,
): number {
	return (earthScaleHeight * radius) / earthRadius;
}
