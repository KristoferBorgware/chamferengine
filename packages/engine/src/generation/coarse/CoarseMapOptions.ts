import type { Landform } from "./Landform.js";

/**
 * The knobs on a coarse map, all of them defaulted.
 *
 * **Every one of these shows in the map picture.** A knob whose effect can only
 * be found by walking the finished world is a knob nobody can set, which is why
 * there is no longer a detail tier, no separate relief frequency, and no height
 * multiplier applied after the map was drawn.
 */
export interface CoarseMapOptions {
	/** Which way the land is decided. */
	readonly landform?: Landform;

	/** Subdivision level of the map. Level 8 is 655,362 cells and 2.5 MB a field. */
	readonly level?: number;

	/** Metres across one cell of the map, which is what makes its heights metric. */
	readonly cellMetres?: number;

	/** How many times the widest feature repeats around the planet. */
	readonly frequency?: number;

	/** How many octaves of noise are summed. */
	readonly octaves?: number;

	/** What each octave's amplitude is multiplied by. Under 1. */
	readonly persistence?: number;

	/** What each octave's frequency is multiplied by. Over 1. */
	readonly lacunarity?: number;

	/** Slides the sample point through the noise field. */
	readonly offsetX?: number;

	readonly offsetY?: number;

	/** Metres from sea level to the tallest ground, before erosion. */
	readonly relief?: number;

	/** Fraction of the surface left above sea level. Earth is near 0.3. */
	readonly landFraction?: number;

	/**
	 * How hard the water cuts. Zero leaves the noise exactly as it fell.
	 *
	 * **Zero by default, and that is a decision rather than a placeholder.**
	 * What the droplets currently cut is lattice-aligned gashes rather than
	 * valleys -- 60.2% of their steps run eight or more cells in one unchanged
	 * direction (F-039) -- so a world is better without them until the walk
	 * carries momentum. `erodeDroplets` still runs and returns on its first
	 * line when this is zero.
	 */
	readonly erosion?: number;

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
}

export const COARSE_MAP_DEFAULTS = {
	landform: "noise",
	level: 8,
	cellMetres: 32,
	frequency: 1.5,
	octaves: 4,
	persistence: 0.5,
	lacunarity: 2,
	offsetX: 0,
	offsetY: 0,
	relief: 300,
	landFraction: 0.3,
	erosion: 0,
	warpAmplitude: 0.8,
	warpFrequency: 1.6,
	creation: 0.35,
	island: 0.0008,
	growthWeight: 0.8,
	plates: 36,
	oceanShare: 0.6,
	biasWeight: 0.15,
	upliftWeight: 1.2,
	upliftReach: 4,
} as const satisfies Required<CoarseMapOptions>;
