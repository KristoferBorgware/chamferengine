import type { CellFeature } from "../noise/CellFeature.js";
import type { NoiseBasis } from "../noise/NoiseBasis.js";

/**
 * The knobs on a coarse map, all of them defaulted.
 *
 * **Every one of these shows in the map picture.** A knob whose effect can only
 * be found by walking the finished world is a knob nobody can set, which is why
 * there is no longer a detail tier, no separate relief frequency, and no height
 * multiplier applied after the map was drawn.
 */
export interface CoarseMapOptions {
	/** Which noise function one octave is. */
	readonly basis?: NoiseBasis;

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

	/** How much each octave is folded at its own zero crossing, for creases. */
	readonly ridge?: number;

	/** Slides the sample point through the noise field. */
	readonly offsetX?: number;

	readonly offsetY?: number;

	/** Metres from sea level to the tallest ground, before erosion. */
	readonly relief?: number;

	/** Metres from sea level down to the deepest sea floor. */
	readonly seaDepth?: number;

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

	/**
	 * How far the warp pushes a sample point. Zero reads it where it stands.
	 */
	readonly warpAmplitude?: number;

	/** Feature size of the field doing the pushing. */
	readonly warpFrequency?: number;

	/** The angle every gradient is turned by, in radians. `psrd` only. */
	readonly spin?: number;

	/**
	 * How far a feature point may sit from its own cell's middle. `cellular`
	 * only. Zero puts every one at a cell centre, which draws a lattice of
	 * identical bumps.
	 */
	readonly jitter?: number;

	/** Which cellular distance is reported. `cellular` only. */
	readonly feature?: CellFeature;
}

export const COARSE_MAP_DEFAULTS = {
	basis: "value",
	level: 8,
	cellMetres: 32,
	frequency: 1.5,
	octaves: 4,
	persistence: 0.5,
	lacunarity: 2,
	ridge: 0.6,
	offsetX: 0,
	offsetY: 0,
	relief: 300,
	seaDepth: 120,
	landFraction: 0.3,
	erosion: 0,
	warpAmplitude: 0.8,
	warpFrequency: 1.6,
	spin: 0,
	jitter: 1,
	feature: "f1",
} as const satisfies Required<CoarseMapOptions>;
