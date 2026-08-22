import { seaLevelFor } from "./seaLevelFor.js";

/** What the metre step needs beyond the field itself. */
export interface MetreScale {
	readonly landFraction: number;

	/** Metres from sea level to the tallest ground, before the peak scale. */
	readonly relief: number;

	/** Metres from sea level down to the deepest floor. */
	readonly seaDepth: number;

	/** Metres the water is dropped below the level the land fraction chose. */
	readonly seaLevel: number;
}

/**
 * Turn a unitless height field into metres above sea level.
 *
 * Four things happen in one pass, and the order is what makes every knob mean
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
 *
 * **The fit is the whole answer to how tall a world is.** Dividing by the
 * field's own peak means the tallest point stands exactly `relief` metres up
 * whatever every knob upstream says, so no shape knob can change the height of
 * the world by accident and `relief` is a number that can be asked for.
 *
 * **Last the water is dropped**, which lifts the whole field rather than moving
 * any of it: draining `seaLevel` metres uncovers the shallow floor that was
 * already there. On the shipped world 60 m of it takes one patch from 31% land
 * to 59%.
 */
export function metreHeight(
	raw: Float64Array,
	scale: MetreScale,
): Float64Array {
	const sea = seaLevelFor(raw, scale.landFraction);
	let peak = 0;
	let trough = 0;
	for (const v of raw) {
		const d = v - sea;
		if (d > peak) peak = d;
		if (d < trough) trough = d;
	}
	const up = peak > 0 ? scale.relief / peak : 0;
	const down = trough < 0 ? scale.seaDepth / -trough : 0;
	const drained = -scale.seaLevel;
	const height = new Float64Array(raw.length);
	for (let cell = 0; cell < raw.length; cell++) {
		const d = raw[cell]! - sea;
		height[cell] = (d >= 0 ? d * up : d * down) + drained;
	}
	return height;
}
