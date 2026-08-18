import { seaLevelFor } from "./seaLevelFor.js";

/**
 * Turn a unitless height field into metres above sea level.
 *
 * Two things happen in one pass, and the order is what makes both knobs mean
 * something a person can point at.
 *
 * **Sea level is subtracted first**, at the percentile that leaves
 * `landFraction` of the surface above it, so the finished field is zero at the
 * waterline. Nothing downstream carries a sea level: land is `height > 0`.
 *
 * **Then the ground is scaled so its tallest point stands exactly `relief`
 * metres up.** That makes the knob "how tall is the highest mountain", rather
 * than a multiplier on however high this seed's noise happened to reach --
 * so two seeds at the same setting give two worlds of the same stature.
 *
 * The sea floor is scaled by the same number, so an ocean is as deep as the
 * noise says it is relative to the peaks. It is not clamped: a field that runs
 * deeper below its sea level than above it gives a sea deeper than `relief`,
 * which is what the crust has to reach past.
 */
export function metreHeight(
	raw: Float64Array,
	landFraction: number,
	relief: number,
): Float64Array {
	const sea = seaLevelFor(raw, landFraction);
	let peak = 0;
	for (const v of raw) if (v - sea > peak) peak = v - sea;
	const scale = peak > 0 ? relief / peak : 0;
	const height = new Float64Array(raw.length);
	for (let cell = 0; cell < raw.length; cell++)
		height[cell] = (raw[cell]! - sea) * scale;
	return height;
}
