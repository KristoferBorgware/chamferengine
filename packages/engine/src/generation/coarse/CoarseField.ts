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
 * `scale` says how a value reaches the ramp. `linear` uses it as it stands.
 * `sea` measures it from the map's own sea level, so the same description
 * works on a planet whose heights sit anywhere. `log` takes `log(1 + value)`,
 * for a field spanning several orders of magnitude — drainage counts run from
 * one cell to hundreds of thousands, and a linear ramp draws that as a black
 * planet with a few white threads.
 */
export interface CoarseField {
	/** The property this reads on a {@link CoarseMap}. */
	readonly key: "height" | "water" | "flow" | "slope";

	/** What to call it beside the picture. */
	readonly label: string;

	/** One sentence on what the numbers are. */
	readonly says: string;

	readonly scale: "linear" | "sea" | "log";

	readonly ramp: CoarseRamp;
}

/** The array a field names, from a map. */
export function coarseFieldOf(
	map: CoarseMap,
	field: CoarseField,
): Float32Array {
	return map[field.key];
}
