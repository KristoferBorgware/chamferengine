/**
 * Everything one octave stack needs, gathered once rather than passed a
 * parameter at a time.
 *
 * One object per layer per map build, read by every one of the several hundred
 * thousand samples that build makes. Nothing here is per cell, so there is no
 * allocation on the sampling path.
 */
export interface NoiseSettings {
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

	/**
	 * How much each octave is folded at its own zero crossing, for creases.
	 *
	 * **Nothing in the generator sets this above zero any more**, and the fold
	 * stays because doc 08 argues it from a measurement and this is the
	 * function that measurement is of. What replaced it is the mountain layer:
	 * a fold creases a whole world at once, moving the character of every place
	 * together, and a second layer is there to make places differ.
	 */
	readonly ridge: number;
}
