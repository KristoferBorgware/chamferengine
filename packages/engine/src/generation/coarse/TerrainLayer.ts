/**
 * One whole noise stack, with the curve its value is read through.
 *
 * **A layer is a stack, not a frequency.** A layer that shared its octave count
 * and its falloff with its neighbour could only ever say the same thing at a
 * different size, and the reason there are layers at all is to say different
 * things: where the land is, how worn it is, and what stands on it.
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

	/** What each octave's amplitude is multiplied by. */
	readonly persistence: number;

	/** What each octave's frequency is multiplied by. */
	readonly lacunarity: number;

	/**
	 * How far each octave is folded at its own zero crossing, `0` to `1`.
	 *
	 * **A sum of smooth things is smooth, and a mountain is a crease.** Every
	 * octave of a plain sum is smooth in its first and second derivative, so
	 * every summit it can build is a dome; `1 - |n|` folds an octave at its own
	 * zero crossing and the fold is the ridge line. At `0` the stack is the
	 * plain sum, bit for bit.
	 *
	 * **It belongs on peaks and valleys and nowhere else.** A fold creases a
	 * whole world at once: folding continentalness creases the coast of every
	 * continent, and a crease in a carve field is one nobody can see from
	 * inside the cave it cuts.
	 */
	readonly fold: number;

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
 * **Continentalness sets the level, and its curve's middle is the waterline.**
 *
 * The two halves scale apart -- up to `relief` above the middle and down to
 * `seaDepth` below it -- so the curve's answer is already in metres, an ocean
 * floor at one end and the top of a plateau at the other. Which of those is
 * coast falls out of the curve rather than being decided by a percentile, and
 * **only the curve decides it**: no metre knob moves the shore.
 *
 * A shelf, a short steep rise, and land that keeps climbing. **The steep part
 * is the coast**, and it has to be steep: peaks and valleys is applied about
 * whatever level this curve sets, so wherever the curve is shallower than a
 * peak is tall, the third field decides land-or-sea rather than relief and the
 * coastline speckles. The point on `0.5` is the shore, pinned on the waterline.
 */
export const CONTINENT_LAYER_DEFAULT: TerrainLayer = {
	metres: 6000,
	octaves: 3,
	persistence: 0.5,
	lacunarity: 2,
	fold: 0,
	curve: [
		[-1, 0],
		[-0.34, 0.0967],
		[-0.06, 0.29],
		[0.06, 0.3222],
		[0.0876, 0.5],
		[0.1, 0.536],
		[0.26, 0.652],
		[0.46, 0.8405],
		[1, 1],
	],
};

/**
 * **Erosion says how much is taken away here**, from none of it to all of it.
 *
 * Up is more cut away, because the layer is called erosion and erosion is
 * removal. What is left of the relief is `1 - cut`, so a region the curve sends
 * to `1` is flat whatever peaks and valleys is doing -- which is the one thing
 * a single stack of octaves can never say.
 *
 * Rising, and in steps rather than as a ramp. A step is what puts an edge
 * between a range and the plain beside it; a ramp gives every place a little of
 * both and the planet one texture.
 */
export const EROSION_LAYER_DEFAULT: TerrainLayer = {
	metres: 7500,
	octaves: 4,
	persistence: 0.5,
	lacunarity: 2,
	fold: 0,
	curve: [
		[-1, 0],
		[-0.3, 0.05],
		[-0.1, 0.45],
		[0.05, 0.82],
		[0.3, 0.94],
		[1, 0.98],
	],
};

/**
 * **Peaks and valleys is the relief itself, signed.**
 *
 * Half way up is the level the continent set: below it cuts a valley and above
 * it raises a peak. **Folded, and it is the only layer that is** -- a ridge is
 * a crease and the only place a crease comes from is an absolute value.
 */
export const PEAKS_LAYER_DEFAULT: TerrainLayer = {
	metres: 600,
	octaves: 4,
	persistence: 0.5,
	lacunarity: 2,
	fold: 0.85,
	curve: [
		[-1, 0.06],
		[-0.45, 0.24],
		[-0.05, 0.42],
		[0.25, 0.58],
		[0.55, 0.84],
		[1, 1],
	],
};

/**
 * **The carve, applied to the result of the other three rather than beside
 * them.**
 *
 * The three fields answer *how high*; this one answers *is this point rock*,
 * and it is read down the column the first three already placed. It is a layer
 * like them and carries the same rows, except a fold: a crease belongs on peaks
 * and valleys, and a crease in a cave field is invisible from inside the cave.
 *
 * **Measured against the crust, not against a landform.** The other three draw
 * continents and mountain ranges and a hundred metres is the smallest thing
 * worth calling one; this has to swing several times inside a crust a couple of
 * hundred metres deep or what comes out is a lowered surface rather than an
 * overhang.
 *
 * **A straight curve is the field itself**, which is where a reader should
 * start: every shape then comes from the noise rather than from something done
 * to it afterwards.
 */
export const CARVE_LAYER_DEFAULT: TerrainLayer = {
	metres: 120,
	octaves: 3,
	persistence: 0.5,
	lacunarity: 2,
	fold: 0,
	curve: [
		[-1, 0],
		[1, 1],
	],
};
