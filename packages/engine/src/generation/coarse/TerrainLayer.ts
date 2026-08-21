/**
 * One whole noise stack, with the curve its value is read through.
 *
 * **A layer is a stack, not a frequency.** A layer that shared its octave count
 * and its falloff with its neighbour could only ever say the same thing at a
 * different size, and the reason there are layers at all is to say different
 * things: broad smooth ground under one curve, narrow steep ranges under
 * another.
 */
export interface TerrainLayer {
	/** How many times the widest octave repeats around the planet. */
	readonly frequency: number;

	readonly octaves: number;

	/** What each octave's amplitude is multiplied by. Under 1. */
	readonly persistence: number;

	/** What each octave's frequency is multiplied by. Over 1. */
	readonly lacunarity: number;

	/** Slides the sample point through the field. */
	readonly offsetX: number;
	readonly offsetY: number;

	/**
	 * The curve the layer's value is read through, as `[in, out]` points.
	 *
	 * Across is the layer's own noise, `-1` to `1`; up is what it controls,
	 * `0` to `1`. Held flat past either end, straight between the points.
	 *
	 * **This is what puts an edge on a region.** A control read straight is one
	 * long fade from end to end; a curve with a knee in it is a coastal shelf
	 * or a mountain front. Where it matters is where the field actually lands
	 * on it -- noise clusters around its own middle, so equal widths of a curve
	 * cover wildly unequal amounts of planet.
	 */
	readonly curve: readonly (readonly [number, number])[];
}

/**
 * A shelf, a shore and a rise: flat sea floor over the low half, a short steep
 * climb through the coast, then land that keeps going up.
 */
export const TERRAIN_LAYER_DEFAULT: TerrainLayer = {
	frequency: 3,
	octaves: 6,
	persistence: 0.5,
	lacunarity: 2,
	offsetX: 15,
	offsetY: 9,
	curve: [
		[-1, 0.08],
		[-0.3, 0.2],
		[-0.05, 0.34],
		[0.15, 0.62],
		[1, 0.95],
	],
};

/**
 * Flat over the low half and steep over the high one.
 *
 * A curve that climbs everywhere makes every place equally half-mountainous,
 * which is the thing a second layer exists to stop. The knee is the mountain
 * front.
 *
 * **What stopped the ranges drawing as flat white mesas was the frequency and
 * the falloff, not the octave count.** Four octaves is what the map can carry:
 * at a 32 m cell and this width the fifth would be 59 m across, under the two
 * cells it takes to draw one, and the panel refuses it. The fix was a narrower
 * widest octave and a slower falloff, so the four that do run carry more of
 * the shape.
 */
export const MOUNTAIN_LAYER_DEFAULT: TerrainLayer = {
	frequency: 7.2,
	octaves: 4,
	persistence: 0.55,
	lacunarity: 2,
	offsetX: -22,
	offsetY: 61,
	curve: [
		[-1, 0],
		[0.05, 0.06],
		[0.45, 0.62],
		[1, 1],
	],
};
