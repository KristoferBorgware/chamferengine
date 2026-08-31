/**
 * Where the climate square starts and stops, in the raw readings' own units.
 *
 * Measured over the planet's own land and then held, because the two spans are
 * a property of the whole world rather than of a place -- the same shape as
 * the height field's metre fit, which divides by the field's own peak.
 */
export interface ClimateFit {
	readonly tLo: number;
	readonly tSpan: number;
	readonly hLo: number;
	readonly hSpan: number;

	/** Whether the spans were measured, or the fit fell back to the raw range. */
	readonly fitted: boolean;
}

/** The fit that maps a raw reading straight through, for a fit turned off. */
export const UNFITTED: ClimateFit = {
	tLo: -1,
	tSpan: 2,
	hLo: -1,
	hSpan: 2,
	fitted: false,
};

/**
 * The fit a table reads when the air dries as it rises.
 *
 * **A fit is measured against a climate model, and every term added to that
 * model makes a different one.** A span taken before the humidity lapse
 * existed starts too high once the lapse is on, because every reading has
 * dropped: measured over six seeds at one-degree steps, humidity reached only
 * `0.00` to `0.77` of the square with a median of `0.34`, and **`17.1%` of
 * all land was clamped flat against the dry edge** -- a sixth of the planet
 * pinned onto one column of the diagram. That is what made a world read as
 * tundra and cold desert whatever its dots said, and what pushed every dot
 * into the left of the chart. Re-measure this whenever the climate gains a
 * term; the dry belts were the last one that moved it.
 *
 * These are the land's 2nd and 98th percentiles over six seeds, the rule a
 * measured fit uses, taken at the shipped lapse and dry belts. The same
 * sweep then reads `0.00` to `0.99` with a median of `0.57`, and `2.6%`
 * clamped.
 */
export const LAPSED_FIT: ClimateFit = {
	tLo: -1.04,
	tSpan: 1.62,
	hLo: -0.88,
	hSpan: 1.04,
	fitted: true,
};
