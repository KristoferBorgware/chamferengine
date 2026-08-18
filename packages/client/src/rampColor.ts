import type { CoarseField } from "chamfer/generation";

/**
 * A field's value as a color, from the ramp its description carries.
 *
 * `scale` is what lets one description cover fields that mean different things.
 * `linear` takes the value as it stands. `sea` measures it from the map's own
 * sea level, so a description works on a planet whose heights sit anywhere.
 * `log` takes `log(1 + value)`, which drainage needs: its counts run from one
 * cell to hundreds of thousands, and a straight ramp draws that as a black
 * planet with a few white threads.
 *
 * Returns `[r, g, b]` in `0` to `255`.
 */
export function rampColor(
	value: number,
	field: CoarseField,
	seaLevel: number,
): [number, number, number] {
	const raw =
		field.scale === "sea"
			? value - seaLevel
			: field.scale === "log"
				? Math.log(1 + Math.max(0, value))
				: value;
	const { low, high, stops } = field.ramp;
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
