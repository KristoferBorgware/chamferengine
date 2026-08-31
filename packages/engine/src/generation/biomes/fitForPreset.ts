import { FIXED_FIT, LAPSED_FIT, type ClimateFit } from "./ClimateFit.js";

/**
 * The span a preset's readings are stretched through, or `null` to measure
 * this planet's own land.
 *
 * **What decides it is whether the table dries its air with height**, not
 * which table it is: a fit is measured against a climate model, and the
 * humidity lapse makes a different one. Both `elevation` and
 * `plainElevation` set that lapse and both measure the same span, so both
 * read {@link LAPSED_FIT}; `holdridge` leaves the air alone and reads
 * {@link FIXED_FIT}, which is what was measured on a world like it.
 *
 * `plain` alone measures its own planet, because its dots were placed
 * assuming the per-planet stretch and its `Fit all biomes on the planet`
 * switch is the one place that stretch is still reachable.
 */
export function fitForPreset(preset: string): ClimateFit | null {
	if (preset === "plain") return null;
	if (preset === "holdridge") return FIXED_FIT;
	return LAPSED_FIT;
}
