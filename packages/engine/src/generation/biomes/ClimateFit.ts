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
 * One fit for every planet, measured once and held as constants.
 *
 * **A table naming a real classification needs both halves of a promise a
 * measured fit cannot keep at once**: the same reading names the same zone
 * on every world, and the whole square is ground somewhere. Measuring each
 * planet's own land keeps the second and breaks the first -- two worlds
 * measure two spans, so one reading lands on two dots. Mapping the raw
 * range straight through keeps the first and breaks the second: the climate
 * terms are noise stacks summed and divided, so their readings cluster in
 * the middle and never reach a corner. Measured over 24 worlds, eight seeds
 * at three reliefs, humidity spanned `0.05` to `0.60` of the square and
 * every zone above it was unreachable -- eight of Holdridge's twenty-three,
 * the whole wet half of its chart.
 *
 * These are the mean of those 24 worlds' own measured spans. Each world's
 * fit sits within about a sixth of the mean (`tSpan` 1.41 to 1.68, `hSpan`
 * 0.77 to 1.03), so one constant is close to what any of them would have
 * measured, and being a constant it maps a reading the same way on all of
 * them.
 */
export const FIXED_FIT: ClimateFit = {
	tLo: -0.91,
	tSpan: 1.52,
	hLo: -0.54,
	hSpan: 0.87,
	fitted: true,
};

/**
 * The fit a table reads when the air dries as it rises.
 *
 * **A fit is measured against a climate model, and turning on the humidity
 * lapse makes a different one.** {@link FIXED_FIT} was measured before that
 * lapse existed, over worlds whose air only cooled with height. Every table
 * that sets `humLapse` then reads a span that starts too high, because every
 * reading it takes has dropped: measured over six seeds at one-degree steps,
 * humidity reached only `0.00` to `0.77` of the square with a median of
 * `0.34`, and **`17.1%` of all land was clamped flat against the dry
 * edge** -- a sixth of the planet pinned onto one column of the diagram.
 * That is what made a world read as tundra and cold desert whatever its dots
 * said, and what pushed every dot into the left of the chart.
 *
 * These are the land's 2nd and 98th percentiles over six seeds, the same
 * rule a measured fit uses, taken with the lapse on. Both tables that set
 * one measure the identical span, which is what says this belongs to the
 * lapse rather than to either table. The same sweep then reads `0.00` to
 * `0.99` with a median of `0.57`, and `2.6%` clamped.
 */
export const LAPSED_FIT: ClimateFit = {
	tLo: -1.04,
	tSpan: 1.6,
	hLo: -0.81,
	hSpan: 0.9,
	fitted: true,
};
