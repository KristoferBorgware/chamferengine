import type { CoarseMap } from "./CoarseMap.js";

/**
 * How a value in one of a coarse map's fields is turned into a color.
 *
 * `low` and `high` are the two ends of the ramp. `stops` are the colors it
 * passes through, as `[r, g, b]` in `0` to `1`, evenly spaced between them.
 */
export interface CoarseRamp {
	readonly low: number;
	readonly high: number;
	readonly stops: readonly (readonly [number, number, number])[];
}

/**
 * One field of a coarse map, and everything needed to draw it.
 *
 * A typed array says how many numbers it holds and nothing about what they
 * mean. Painting one needs three things it cannot supply: the range the values
 * occupy, the colors that range maps onto, and a name to put beside the
 * picture.
 *
 * `scale` says how a value reaches the ramp. `linear` uses it as it stands,
 * which is every field here now that a height is metres above a sea level of
 * zero. `log` takes `log(1 + value)`, for a field spanning several orders of
 * magnitude.
 */
export interface CoarseField {
	/** The property this reads on a {@link CoarseMap}. */
	readonly key: "height" | "slope";

	/** What to call it beside the picture. */
	readonly label: string;

	/** One sentence on what the numbers are. */
	readonly says: string;

	readonly scale: "linear" | "log";

	/**
	 * Another field this one is drawn as a difference from.
	 *
	 * Water is the field that needs it. What it stores is the height water
	 * stands at, which over the ocean is sea level exactly -- so drawn against
	 * the terrain ramp the whole sea came out one flat shore color and could
	 * not be told from lowland. The useful picture is how deep the water is,
	 * which is this field minus the ground, and that is zero on dry land.
	 */
	readonly against?: CoarseField["key"];

	readonly ramp: CoarseRamp;
}

/** The array a field names, from a map. */
export function coarseFieldOf(
	map: CoarseMap,
	field: { readonly key: CoarseField["key"] },
): Float32Array {
	return map[field.key];
}
