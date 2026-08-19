import type { CoarseField } from "./CoarseField.js";

/**
 * Every picture the editor can draw of a coarse map, in the order it lists
 * them.
 *
 * **Two pictures of one field.** The map carries a single array — metres above
 * sea level — and these are two ways of looking at it that stop at different
 * points in the build. Height is the ground the noise makes, before water has
 * touched it, so it redraws without waiting for the slow step. Ground is the
 * finished surface in the colours the world is built from.
 */
export const COARSE_FIELDS: readonly CoarseField[] = [
	{
		id: "height",
		key: "height",
		stage: "metres",
		label: "Height",
		says: "The ground the noise makes, in metres above sea level, before any water has cut into it. This is the picture the octave knobs are turned against, and it redraws without waiting for erosion.",
		scale: "linear",
		// Grey, and absolute metres like the other one, so Relief brightens it
		// rather than being normalised away. Sea level is the middle stop.
		ramp: {
			low: -400,
			high: 400,
			stops: [
				[0.03, 0.03, 0.04],
				[0.26, 0.27, 0.3],
				[0.5, 0.51, 0.54],
				[0.76, 0.77, 0.79],
				[1.0, 1.0, 1.0],
			],
		},
	},
	{
		id: "ground",
		key: "height",
		stage: "erosion",
		label: "Ground",
		says: "The finished surface, after the water has cut into it, in the colours the world is built from. Zero is the waterline, so everything blue is sea and everything else is land.",
		scale: "linear",
		// Absolute metres, not a range that stretches to fit whatever this
		// planet happens to hold. A ramp scaled to the field would draw every
		// world the same and make Relief a knob with no picture, which is the
		// complaint that removed the height multiplier: the point of stating a
		// height in metres is that 100 m of it looks different from 600 m.
		// Every 100 m is a stop, so the shipped 300 m of relief reaches bare
		// rock and raising it walks the peaks up into snow.
		ramp: {
			low: -400,
			high: 400,
			stops: [
				[0.04, 0.08, 0.28],
				[0.1, 0.24, 0.55],
				[0.22, 0.46, 0.76],
				[0.42, 0.68, 0.88],
				[0.87, 0.83, 0.6],
				[0.31, 0.56, 0.26],
				[0.52, 0.5, 0.3],
				[0.47, 0.44, 0.41],
				[0.98, 0.98, 1.0],
			],
		},
	},
] as const;
