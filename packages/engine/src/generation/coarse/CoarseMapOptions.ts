import type { Landform } from "./Landform.js";

/** The knobs on a coarse map, all of them defaulted. */
export interface CoarseMapOptions {
	/** Which way the land is decided. */
	readonly landform?: Landform;

	/** How far the warp pushes a sample point. `warped` only. */
	readonly warpAmplitude?: number;

	/** Feature size of the field doing the pushing. `warped` only. */
	readonly warpFrequency?: number;

	/** How much of the coarsest level starts as land. `grown` only. */
	readonly creation?: number;

	/** How often a sea cell becomes land on its own. `grown` only. */
	readonly island?: number;

	/** How strongly a cell is pulled toward its neighbours. `grown` only. */
	readonly growthWeight?: number;

	/** How many plates the surface is cut into. `plates` only. */
	readonly plates?: number;

	/** How many of them are ocean floor. `plates` only. */
	readonly oceanShare?: number;

	/**
	 * How far apart ocean floor and continent stand. `plates` only.
	 *
	 * Land ends up a flat `2 x` this above sea level across a whole plate, so
	 * it is the knob that decides whether a continent draws as lowland or as a
	 * saturated slab.
	 */
	readonly biasWeight?: number;

	/** How high a range rises where two plates close. `plates` only. */
	readonly upliftWeight?: number;

	/** How far inland a range reaches, in cells at level 7. `plates` only. */
	readonly upliftReach?: number;

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
	landform: "noise",
	warpAmplitude: 0.35,
	warpFrequency: 1.6,
	creation: 0.35,
	island: 0.0008,
	growthWeight: 0.8,
	plates: 36,
	oceanShare: 0.6,
	biasWeight: 0.15,
	upliftWeight: 1.2,
	upliftReach: 4,
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
