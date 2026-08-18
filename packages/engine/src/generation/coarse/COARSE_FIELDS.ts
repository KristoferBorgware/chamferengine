import type { CoarseField } from "./CoarseField.js";

/**
 * Deep water through shallow, to the shore, then lowland, upland, rock, snow.
 *
 * **Nine stops, so sea level lands exactly on one of them.** The stops are
 * evenly spaced and the ramp is symmetric about sea level, so an odd count
 * puts the middle stop at a height of zero. The sand is the waterline rather
 * than sitting half a stop under it, which is where eight put it -- the last
 * `0.05` of water drew as beach.
 */
const TERRAIN: CoarseField["ramp"] = {
	low: -0.35,
	high: 0.35,
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
};

/**
 * Every field a coarse map carries, in the order the editor lists them.
 *
 * A field appears here or it cannot be drawn. `coarseFields.test.ts` walks the
 * map's own properties against this table, so a field added to one and not the
 * other fails rather than going quietly missing from the editor.
 */
export const COARSE_FIELDS: readonly CoarseField[] = [
	{
		key: "height",
		label: "Ground",
		says: "The surface after erosion has cut into it, measured from sea level.",
		scale: "sea",
		ramp: TERRAIN,
	},
	{
		key: "water",
		label: "Water",
		says: "How deep the water is. Zero on dry land, the distance down to the seabed under the ocean, and the distance down to the floor of a flooded basin under a lake.",
		scale: "linear",
		against: "height",
		ramp: {
			low: 0,
			high: 0.3,
			stops: [
				[0.72, 0.7, 0.62],
				[0.55, 0.8, 0.9],
				[0.2, 0.45, 0.78],
				[0.04, 0.1, 0.32],
			],
		},
	},
	{
		key: "flow",
		label: "Drainage",
		says: "How many cells drain through each one. A river is a large value, and the scale is logarithmic because the range runs from one cell to hundreds of thousands.",
		scale: "log",
		ramp: {
			low: 0,
			high: 12,
			stops: [
				[0.06, 0.06, 0.09],
				[0.13, 0.3, 0.5],
				[0.3, 0.62, 0.85],
				[0.75, 0.93, 1.0],
			],
		},
	},
	{
		key: "slope",
		label: "Slope",
		says: "How steeply the ground falls away, as rise over run rather than a drop per cell, so the picture means the same at every map size. Flat ground is dark, a cliff is bright.",
		scale: "linear",
		// Eight is where noise and warped put their 99th percentile, near 6,
		// comfortably inside the ramp, and their steepest ground, near 10, at
		// white. The old 0.02 was a drop per cell step, which halves at every
		// finer level and was under the median at every level measured: 68 to
		// 80% of the planet drew at full white and the map said nothing.
		ramp: {
			low: 0,
			high: 8,
			stops: [
				[0.04, 0.04, 0.05],
				[0.55, 0.55, 0.58],
				[1.0, 0.98, 0.9],
			],
		},
	},
] as const;
