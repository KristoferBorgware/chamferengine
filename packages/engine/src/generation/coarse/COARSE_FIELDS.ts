import type { CoarseField } from "./CoarseField.js";

/** Deep water through shallow, to shore, lowland, upland, rock and snow. */
const TERRAIN: CoarseField["ramp"] = {
	low: -0.35,
	high: 0.35,
	stops: [
		[0.05, 0.09, 0.34],
		[0.15, 0.32, 0.66],
		[0.36, 0.62, 0.83],
		[0.85, 0.81, 0.55],
		[0.29, 0.55, 0.24],
		[0.55, 0.51, 0.29],
		[0.47, 0.43, 0.4],
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
		says: "What water stands on: sea level over the ocean, the lake surface over a flooded basin, the ground everywhere else.",
		scale: "sea",
		ramp: TERRAIN,
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
		says: "The largest height difference from a cell to any of its neighbours. Flat ground is dark, a cliff is bright.",
		scale: "linear",
		ramp: {
			low: 0,
			high: 0.02,
			stops: [
				[0.04, 0.04, 0.05],
				[0.55, 0.55, 0.58],
				[1.0, 0.98, 0.9],
			],
		},
	},
] as const;
