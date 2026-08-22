/**
 * One whole noise stack, with the curve its value is read through.
 *
 * **A layer is a stack, not a frequency.** A layer that shared its octave count
 * with its neighbour could only ever say the same thing at a different size,
 * and the reason there are layers at all is to say different things: broad
 * smooth ground under one curve, narrow steep ranges under another.
 */
export interface TerrainLayer {
	/**
	 * Metres across the widest octave.
	 *
	 * **A size, because a frequency is a number about a sphere and a landform
	 * is a thing on the ground.** The noise is sampled from a unit direction,
	 * so its frequency counts features from pole to pole: the same number is
	 * hills on one planet and continents on another. Stated in metres, the
	 * number means the same on every radius, and changing the radius then moves
	 * the horizon and leaves the landforms alone.
	 */
	readonly metres: number;

	readonly octaves: number;

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
 * What every layer's octave stack does between its octaves.
 *
 * Halving the amplitude and doubling the frequency each octave is what fBm is,
 * and the metre fit downstream divides whatever the stack reaches straight back
 * out -- so moving either one changes how rough the ground is and not how tall.
 * That is a question the two layers and their curves already answer, in a place
 * where the answer can be seen.
 */
export const LAYER_PERSISTENCE = 0.5;
export const LAYER_LACUNARITY = 2;

/**
 * A shelf, a shore and a rise: flat sea floor over the low half, a short steep
 * climb through the coast, then land that keeps going up.
 */
export const TERRAIN_LAYER_DEFAULT: TerrainLayer = {
	metres: 2400,
	octaves: 6,
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
 * **What stopped the ranges drawing as flat white mesas was the width and the
 * octave count.** Four octaves is what the map can carry: at a 32 m cell and
 * this width the fifth would be 60 m across, under the two cells it takes to
 * draw one, and the panel refuses it.
 */
export const MOUNTAIN_LAYER_DEFAULT: TerrainLayer = {
	metres: 960,
	octaves: 4,
	curve: [
		[-1, 0],
		[0.05, 0.06],
		[0.45, 0.62],
		[1, 1],
	],
};
