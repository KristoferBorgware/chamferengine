import type { CoarseMap } from "./CoarseMap.js";
import type { CoarseStage } from "./CoarseStage.js";

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
	/** Names this picture. Two pictures may read one field. */
	readonly id: string;

	/** The property this reads on a {@link CoarseMap}. */
	readonly key: "height";

	/**
	 * How far down the build this picture needs, and no further.
	 *
	 * The steps are a chain and the slow one is at the bottom, so a picture of
	 * the ground before water cut into it does not have to wait for the water.
	 * A map pane naming an early step redraws while a knob is still moving.
	 */
	readonly stage: CoarseStage;

	/** What to call it beside the picture. */
	readonly label: string;

	readonly scale: "linear" | "log";

	readonly ramp: CoarseRamp;
}

/** The array a field names, from a map. */
export function coarseFieldOf(
	map: CoarseMap,
	field: { readonly key: CoarseField["key"] },
): Float32Array {
	return map[field.key];
}
