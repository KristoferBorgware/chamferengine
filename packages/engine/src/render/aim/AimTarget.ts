import type { Vec3 } from "../../math/Vec3.js";

/**
 * The cell a click would act on, drawn as an outline so it can be seen before
 * the click.
 *
 * The corners are unit directions from the planet's centre, one per edge of the
 * cell -- six for a hexagon and five for a pentagon. The two radii are the top
 * and bottom of the layer, so the outline is a prism rather than a ring and
 * reads the same against a wall as against a floor.
 */
export interface AimTarget {
	readonly corners: readonly Vec3[];
	readonly inner: number;
	readonly outer: number;
	readonly color: readonly [number, number, number];
}
