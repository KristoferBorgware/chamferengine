import { seaLevelFor } from "./seaLevelFor.js";

/**
 * Turn a unitless height field into metres above sea level.
 *
 * Three things happen in one pass, and the order is what makes every knob mean
 * something a person can point at.
 *
 * **Sea level is subtracted first**, at the percentile that leaves
 * `landFraction` of the surface above it, so the finished field is zero at the
 * waterline. Nothing downstream carries a sea level: land is `height > 0`.
 *
 * **Then the land and the sea floor are scaled separately**, each to its own
 * knob. Land's tallest point stands exactly `relief` metres up and the sea's
 * deepest point exactly `seaDepth` metres down, which makes both "how tall is
 * the highest mountain" and "how deep is the deepest ocean" rather than
 * multipliers on however far this seed's noise happened to reach.
 *
 * **One scale for both was what capped the mountains.** Noise is roughly
 * symmetric about its own middle and sea level is a percentile above that
 * middle, so the floor ran `1.92x` deeper than the peaks were tall: at 300 m of
 * relief the sea reached `-575 m`, and the crust had to span all `942 m` of a
 * `1,024`-layer budget. The ocean was spending twice the layer field on ground
 * that is never seen -- doc 25 draws water from above, and a sea floor is
 * visible only where it meets the shore. Split, the crust spans `relief +
 * seaDepth` and Relief is free to be the number it says it is.
 */
export function metreHeight(
	raw: Float64Array,
	landFraction: number,
	relief: number,
	seaDepth: number,
): Float64Array {
	const sea = seaLevelFor(raw, landFraction);
	let peak = 0;
	let trough = 0;
	for (const v of raw) {
		const d = v - sea;
		if (d > peak) peak = d;
		if (d < trough) trough = d;
	}
	const up = peak > 0 ? relief / peak : 0;
	const down = trough < 0 ? seaDepth / -trough : 0;
	const height = new Float64Array(raw.length);
	for (let cell = 0; cell < raw.length; cell++) {
		const d = raw[cell]! - sea;
		height[cell] = d >= 0 ? d * up : d * down;
	}
	return height;
}
