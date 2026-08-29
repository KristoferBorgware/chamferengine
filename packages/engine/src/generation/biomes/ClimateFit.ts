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
