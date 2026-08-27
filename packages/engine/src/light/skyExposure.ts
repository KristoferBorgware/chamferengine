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
 *
 * ## What a blocked direction is worth
 *
 * A direction that is blocked used to be worth **nothing**, and everything
 * enclosed fell to one flat floor. That is what a deep shaft looked like: not
 * dark at the bottom and lighter at the mouth, but the same number all the way
 * down, because as soon as every direction was blocked there was nothing left
 * to vary. It is also wrong about the world -- a direction blocked by rock is
 * a direction pointing at a **lit surface**, and some of what lands there
 * comes back.
 *
 * So a blocked direction now returns a share of what it intercepted. Two
 * things decide how much. The **share** is how much of the light a surface
 * gives back rather than absorbing -- ground returns something like a third.
 * The **depth** is how far the blocker rises above this face: the part of a
 * wall a cell can see from ten layers down is itself ten layers into shadow,
 * so it has less to give than the lip of a hollow a single layer deep.
 *
 * **It is one bounce and it carries no colour.** What comes back is a fraction
 * of a scalar, so a red wall does not tint the floor beside it. That needs to
 * know the blocker's own block type and to carry three channels instead of
 * one, which is a light field rather than a term in this function.
 *
 * **And it is the sky's bounce, never the sun's.** This is baked into the
 * mesh, and the sun moves; anything that followed the sun would be wrong the
 * moment it did, and re-baking means meshing every chunk again. So a sunlit
 * rim throws no warm patch on the far wall -- that needs light computed while
 * the world is being looked at rather than while it is being built.
 */
export function skyExposure(
	groundLayer: number,
	neighbourLayers: readonly number[],
	reach: number,
	floor = 0.35,
	bounce = 0,
): number {
	let blocked = 0;
	let returned = 0;
	let counted = 0;
	for (const layer of neighbourLayers) {
		// A smaller layer number is higher up, because layers count downward.
		const above = groundLayer - layer;
		if (above > 0) {
			const shut = Math.min(1, above / reach);
			blocked += shut;
			// What that direction sends back. The blocker is lit by the sky
			// it stands under, and how much of it this face can see falls off
			// as the blocker rises: at the lip of a shallow hollow most of the
			// wall is still in the open, and ten layers down it is not.
			returned += (shut * bounce) / (1 + above / reach);
		}
		counted++;
	}
	if (counted === 0) return 1;
	const direct = floor + (1 - floor) * (1 - blocked / counted);
	// The bounce adds to the direct term rather than being blended into it, so
	// an open face is untouched -- it blocks nothing, so nothing is
	// intercepted, so there is nothing to send back. At `bounce` zero this is
	// the direct term exactly, to the bit.
	return Math.min(1, direct + returned / counted);
}
