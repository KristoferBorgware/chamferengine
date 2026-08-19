import type { CellFeature } from "./CellFeature.js";
import type { NoiseBasis } from "./NoiseBasis.js";

/**
 * Everything the octave stack needs, gathered once rather than passed a
 * parameter at a time.
 *
 * One object per map build, read by every one of the several hundred thousand
 * samples that build makes. Nothing here is per cell, so there is no
 * allocation on the sampling path.
 *
 * **The spin is carried as its sine and cosine rather than as an angle.** The
 * only basis that uses it turns every gradient by one shared rotation, and a
 * rotation stated by its sine and cosine keeps the sampling path clear of
 * trigonometry -- which is what lets two machines agree on the field to the
 * bit, since a library sine is not an IEEE operation and two runtimes may
 * return results a bit apart.
 */
export interface NoiseSettings {
	readonly basis: NoiseBasis;

	/** How many times the widest feature repeats around the planet. */
	readonly frequency: number;

	readonly octaves: number;

	/** What each octave's amplitude is multiplied by. */
	readonly persistence: number;

	/** What each octave's frequency is multiplied by. */
	readonly lacunarity: number;

	/** Slides the sample point through the field. */
	readonly offsetX: number;
	readonly offsetY: number;

	/** How much each octave is folded at its own zero crossing, for creases. */
	readonly ridge: number;

	/** How far a cellular feature point may sit from its own cell's middle. */
	readonly jitter: number;

	/** Which cellular distance is reported. */
	readonly feature: CellFeature;

	/** The angle every psrd gradient is turned by, as a sine and a cosine. */
	readonly spinSin: number;
	readonly spinCos: number;
}
