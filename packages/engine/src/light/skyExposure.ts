/**
 * How much of the sky a cell can see, from the ground around it.
 *
 * A cell at the bottom of a valley has taller ground on several sides and takes
 * less of the sky than one on a ridge. That is a different scale from the
 * occlusion at a face's corners, which only ever sees the two cells touching
 * that corner, and it is what separates a hillside from a hollow.
 *
 * Only ground above the cell counts. Ground below it blocks nothing.
 *
 * Light is a **scalar**, so none of the sphere's difficulties reach this. A
 * heading carried around a loop comes back rotated and a pentagon is one
 * direction short, and neither means anything to a number with no direction in
 * it.
 */
export function skyExposure(
	groundLayer: number,
	neighbourLayers: readonly number[],
	reach: number,
	floor = 0.35,
): number {
	let blocked = 0;
	let counted = 0;
	for (const layer of neighbourLayers) {
		// A smaller layer number is higher up, because layers count downward.
		const above = groundLayer - layer;
		if (above > 0) blocked += Math.min(1, above / reach);
		counted++;
	}
	if (counted === 0) return 1;
	return floor + (1 - floor) * (1 - blocked / counted);
}
