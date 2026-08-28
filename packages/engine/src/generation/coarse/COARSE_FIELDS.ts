import type { CoarseField } from "./CoarseField.js";

/**
 * Every picture the editor can draw of a coarse map, in the order it lists
 * them.
 *
 * **Two pictures of one field.** The map carries a single array — metres above
 * sea level — and these are two ways of looking at it that stop at different
 * points in the build. Height is a grey ramp over the ground the noise makes,
 * before water has touched it, so it redraws without waiting for the slow step
 * and reads elevation everywhere. Ground is the finished surface in the blocks
 * the world builds from, in bands rather than a blend, because a block is one
 * thing or another.
 */
export const COARSE_FIELDS: readonly CoarseField[] = [
	{
		id: "height",
		key: "height",
		stage: "metres",
		label: "Height",
		scale: "linear",
		// Grey, and absolute metres like the other one, so Relief brightens it
		// rather than being normalised away. Sea level is the middle of it.
		ramp: {
			low: -400,
			high: 400,
		},
	},
	{
		id: "ground",
		key: "height",
		stage: "metres",
		label: "Ground",
		scale: "linear",
		// **This picture names blocks, so it carries no range of its own to
		// speak of.** What is the ground made of here is answered by the four
		// materials and the two elevations `GROUND_LINES` fixes, in absolute
		// metres, and the painter reads them there. The two numbers below are
		// only what the grey pictures of the same field are stretched between,
		// kept on the 100 m grid the material lines sit on.
		ramp: {
			low: -100,
			high: 500,
		},
	},
] as const;
