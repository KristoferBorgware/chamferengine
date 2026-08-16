/** The knobs on a coarse map, all of them defaulted. */
export interface CoarseMapOptions {
	/** Subdivision level of the map. Level 8 is 655,362 cells and 2.5 MB a field. */
	readonly level?: number;

	/**
	 * Noise frequency of the continent tier.
	 *
	 * This is the number that decides how long rivers get. A river cannot be
	 * longer than the land it crosses, and raising the frequency breaks the
	 * surface into many small blobs: at 6.0 the largest landmass carries a
	 * 31-cell river, at 0.8 it carries 86.
	 */
	readonly continentFrequency?: number;

	readonly continentOctaves?: number;

	/** Frequency of the relief laid over the continents. */
	readonly reliefFrequency?: number;

	readonly reliefOctaves?: number;

	/** How much the relief moves the surface, against a continent tier of 1. */
	readonly reliefAmplitude?: number;

	/** Fraction of the surface left above sea level. Earth is near 0.3. */
	readonly landFraction?: number;

	/** How many rounds of incision run. Each one refills and reroutes first. */
	readonly erosionPasses?: number;

	/** How deeply one round cuts, against a drainage area of one cell. */
	readonly erosionRate?: number;
}

export const COARSE_MAP_DEFAULTS = {
	level: 8,
	continentFrequency: 0.8,
	continentOctaves: 4,
	reliefFrequency: 6,
	reliefOctaves: 5,
	reliefAmplitude: 0.35,
	landFraction: 0.3,
	erosionPasses: 4,
	erosionRate: 0.004,
} as const satisfies Required<CoarseMapOptions>;
