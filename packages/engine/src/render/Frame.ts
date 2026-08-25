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
	 * Unit direction toward the moon, and how bright it is.
	 *
	 * The moon is the only thing with a direction after dark. Without it the
	 * night is one flat number over every face, and a block is a silhouette
	 * rather than a shape. Its brightness is a fraction of what the sun is
	 * worth, and it fades out as the day comes up rather than switching.
	 */
	readonly moon: readonly [number, number, number];
	readonly moonLight: number;

	/**
	 * What the whole frame is multiplied by on its way to the screen.
	 *
	 * The world is drawn in light rather than in color, so a surface in full
	 * sun and one at dawn differ by however much less light there is. An eye
	 * does not: it opens. This is that, and it is why a shadow at sunrise is
	 * visible at all -- the shadow takes away the same fraction either way,
	 * and the fraction only reads once the picture is exposed for the light
	 * that is actually there.
	 */
	readonly exposure: number;

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

	/**
	 * What the direct sun is worth on a surface, as a plain multiplier.
	 *
	 * The sky has its own brightness in the atmosphere's knobs, and this is
	 * the other half: how hard the sun itself lands on the ground. `1` is the
	 * balance against the sky that the ground shader's own `SUN_SHARE`
	 * describes; under it the world reads as an overcast day, over it as a
	 * harder light with deeper shadow between the lit faces and the turned
	 * ones.
	 */
	readonly sunLight: number;
}
