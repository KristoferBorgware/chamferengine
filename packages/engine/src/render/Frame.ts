import type { Mat4 } from "../math/Mat4.js";

/** What one frame needs: where the camera is, what lights it, and what it is in. */
export interface Frame {
	readonly viewProj: Mat4;
	readonly eye: readonly [number, number, number];

	/**
	 * The matrix to cull against, when that is not the one being drawn with.
	 *
	 * Normally absent, and then the view being drawn decides what is in it.
	 * Setting it holds the cull at a camera the frame is no longer taken from,
	 * so what is drawn is what *that* camera could see -- which is how the
	 * decision itself is looked at, by flying out of the frozen view and
	 * seeing where its edges fall.
	 */
	readonly cullViewProj?: Mat4 | undefined;

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

	/**
	 * How much daylight reaches the camera's own place, and what is left
	 * without it.
	 *
	 * The first is one dot product between the sun and the camera's up, and it
	 * carries the whole day and night cycle. The second is the light a surface
	 * keeps after dark.
	 */
	readonly daylight: number;
	readonly nightLight: number;
}
