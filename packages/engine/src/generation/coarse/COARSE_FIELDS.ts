import type { CoarseField } from "./CoarseField.js";

/**
 * Every field a coarse map carries, in the order the editor lists them.
 *
 * A field appears here or it cannot be drawn. `COARSE_FIELDS.test.ts` walks the
 * map's own properties against this table, so a field added to one and not the
 * other fails rather than going quietly missing from the editor.
 *
 * **Two, where there were four.** Water and Drainage were separate fields
 * because a lake stood above sea level and a river had a width; with neither
 * generated, water is wherever the ground is under zero and the height map says
 * so on its own.
 */
export const COARSE_FIELDS: readonly CoarseField[] = [
	{
		key: "height",
		label: "Ground",
		says: "Metres above sea level, after the water has cut into it. Zero is the waterline, so everything blue is sea and everything else is land.",
		scale: "linear",
		// Absolute metres, not a range that stretches to fit whatever this
		// planet happens to hold. A ramp scaled to the field would draw every
		// world the same and make Relief a knob with no picture, which is the
		// whole complaint that removed the height multiplier: the point of
		// stating a height in metres is that 100 m of it looks different from
		// 600 m. Every 100 m is a stop, so the shipped 300 m of relief reaches
		// bare rock and raising it walks the peaks up into snow.
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
	{
		key: "slope",
		label: "Slope",
		says: "How steeply the ground falls away, as metres of fall per metre travelled. Flat ground is dark and a cliff is bright, and the number means the same at every map size.",
		scale: "linear",
		// Erosion is what puts ground at the top of this ramp. Measured at
		// level 7 on the shipped ground: unwatered noise runs to `0.21` at the
		// 99th percentile and `0.30` at its steepest, and water at full
		// strength takes those to `0.58` and `1.24` -- so the channels it cuts
		// are what the bright end shows.
		ramp: {
			low: 0,
			high: 0.6,
			stops: [
				[0.04, 0.04, 0.05],
				[0.55, 0.55, 0.58],
				[1.0, 0.98, 0.9],
			],
		},
	},
] as const;
