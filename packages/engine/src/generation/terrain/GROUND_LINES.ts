/**
 * The two elevations that cut land into three materials, in metres above sea
 * level.
 *
 * **Absolute metres, not fractions of the relief.** The map paints in metres
 * and the world builds in metres, so the two agree on where the colors change
 * only if both read the same numbers -- which is what this file is. The cost of
 * stating them absolutely is that a low world never reaches them: ground that
 * tops out at 300 m is grass to its summit, with no rock and no snow anywhere
 * on it. That is the honest reading of a 300 m hill, and Relief is the knob
 * that walks a world up through the bands.
 *
 * The map's ramp is banded on the same 100 m grid these sit on, so moving one
 * of them without moving the ramp is caught by a test rather than by looking.
 */
export const GROUND_LINES = {
	/** Above this the soil is gone and the stone the ground is made of shows. */
	rock: 300,

	/** Above this a layer of snow lies on that stone. */
	snow: 400,
} as const;
