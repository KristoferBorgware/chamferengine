import type { Mat4 } from "../math/Mat4.js";

/** What one frame needs: where the camera is, what lights it, and what it is in. */
export interface Frame {
	readonly viewProj: Mat4;
	readonly eye: readonly [number, number, number];

	/** Unit direction toward the sun. */
	readonly sun: readonly [number, number, number];

	/**
	 * The color the view fades toward, and the distance it fades over.
	 *
	 * A camera above water sets a distance past the horizon, which leaves the
	 * view untouched. A camera inside a water cell sets the water's own color
	 * and a few tens of metres.
	 */
	readonly fog: readonly [number, number, number, number];
}
