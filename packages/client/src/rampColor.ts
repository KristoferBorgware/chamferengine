import type { CoarseField } from "chamfer/generation";

/**
 * A field's value as a color, from the ramp its description carries.
 *
 * `scale` is what lets one description cover fields that mean different things.
 * `linear` takes the value as it stands, which both fields do now that heights
 * are metres above a sea level of zero. `log` takes `log(1 + value)`, for a
 * field spanning several orders of magnitude.
 *
 * Returns `[r, g, b]` in `0` to `255`.
 */
export function rampColor(
	value: number,
	field: CoarseField,
): [number, number, number] {
	const raw =
		field.scale === "log" ? Math.log(1 + Math.max(0, value)) : value;
	const { low, high, stops, hard } = field.ramp;
	// A banded ramp takes one stop whole: its colors are the blocks the world
	// builds, and a mix of two of them is a block that does not exist.
	if (hard) {
		const band = Math.min(
			stops.length - 1,
			Math.max(
				0,
				Math.floor(((raw - low) / (high - low)) * stops.length),
			),
		);
		const c = stops[band]!;
		return [255 * c[0], 255 * c[1], 255 * c[2]];
	}
	const t =
		Math.min(1, Math.max(0, (raw - low) / (high - low))) *
		(stops.length - 1);
	const first = Math.min(stops.length - 2, Math.floor(t));
	const mix = t - first;
	const a = stops[first]!;
	const b = stops[first + 1]!;
	return [
		255 * (a[0] + (b[0] - a[0]) * mix),
		255 * (a[1] + (b[1] - a[1]) * mix),
		255 * (a[2] + (b[2] - a[2]) * mix),
	];
}
