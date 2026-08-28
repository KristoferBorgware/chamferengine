import type { CoarseGrid } from "./CoarseGrid.js";
import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import type { NoiseSettings } from "../noise/NoiseSettings.js";
import type { TerrainLayer } from "./TerrainLayer.js";
import { CELL_CONSTANT } from "../../world/CELL_CONSTANT.js";
import { layerNoise } from "./layerNoise.js";
import { shapeLayers } from "./shapeLayers.js";

/**
 * Offsets from the world seed, so the four layers are four fields.
 *
 * Exported so a caller can sample a layer's own field independently of a whole
 * map build -- the panel's curve rows do, to draw the histogram of where the
 * world actually lands on a curve.
 */
export const CONTINENT_SEED_OFFSET = 101;
export const EROSION_SEED_OFFSET = 211;
export const PEAKS_SEED_OFFSET = 337;
export const CARVE_SEED_OFFSET = 977;

/** What one build of the surface hands on. */
export interface LayeredField {
	/** Metres above sea level, one entry per grid cell. */
	readonly raw: Float64Array;

	/**
	 * What each layer's curve returned at each cell, `0` to `1`.
	 *
	 * The height says what the ground is and hides which layer said it. A
	 * picture of one layer on its own is how a curve is judged -- dark where
	 * that layer says nothing, bright where it says most -- and these are what
	 * it draws. `float32` because they are looked at rather than computed with.
	 */
	readonly continent: Float32Array;
	readonly erosion: Float32Array;
	readonly peaks: Float32Array;

	/**
	 * How much of the planet stands above sea level, `0` to `1`.
	 *
	 * **A measurement and not a knob.** The coast is where the continentalness
	 * curve crosses its own middle, so how much land there is falls out of that
	 * curve -- it is read back off the finished field rather than asked for,
	 * and no metre knob moves it.
	 */
	readonly land: number;
}

/**
 * The planet's radius, from the two numbers that describe its map.
 *
 * A map cell is `CELL_CONSTANT * radius / 2^level` metres across, so a map
 * stated in metres at a level already says how big the planet is. That is what
 * lets a layer be set in metres: the frequency the noise takes is this divided
 * by the layer's own width.
 */
export function radiusOf(cellMetres: number, level: number): number {
	return (cellMetres * 2 ** level) / CELL_CONSTANT;
}

/**
 * The octave-stack settings for one layer, read off its own knobs.
 *
 * Exported alongside the seed offsets above, for the same reason: a caller
 * sampling one layer on its own needs to build exactly what this file passes to
 * `octaveNoise` internally, not a hand-copied approximation of it.
 */
export function layerNoiseSettings(
	layer: TerrainLayer,
	radius: number,
): NoiseSettings {
	return {
		// A frequency counts how many times the widest octave repeats around
		// the planet, and the layer is set as how wide that octave is.
		frequency: radius / Math.max(1, layer.metres),
		octaves: layer.octaves,
		persistence: layer.persistence,
		lacunarity: layer.lacunarity,
		// **There is no offset.** Sliding a field sideways names a different
		// world, and the seed already does that -- with every octave moved
		// rather than the stack as a whole.
		offsetX: 0,
		offsetY: 0,
		ridge: layer.fold,
	};
}

/**
 * The surface as three noise layers and three curves, sampled from each cell's
 * own direction in 3D.
 *
 * Sampled in 3D world space and never from a face's own `(i, j)`, which is what
 * makes the thirty face edges invisible: a cell on an edge has two names and
 * one direction, so both names give it the same height.
 *
 * **A single octave stack makes one kind of landscape.** fBm is homogeneous --
 * every octave applies everywhere at one amplitude, so one statistic describes
 * the whole planet and nothing in it can say *be different here*. Measured as
 * the spread of local roughness, calmest tenth against roughest tenth, one
 * stack gives `1.3x`.
 *
 * **The order is the whole construction.** Continentalness sets the level,
 * erosion decides how much relief survives there, and peaks and valleys is the
 * relief itself. Reading them the other way round -- relief first, then a
 * continent under it -- gives a mountain range that starts in the sea, because
 * nothing in the range's own field knows where it is.
 *
 * **The pass is in two halves, and this is both of them.** `layerNoise` reads
 * the octave stacks and `shapeLayers` reads the curves off them; a caller that
 * changes only a curve or a metre knob runs the second alone. Anything building
 * a map once wants this, and gets exactly what the two halves give.
 */
export function layeredHeight(
	grid: CoarseGrid,
	seed: number,
	options: CoarseMapOptions = {},
): LayeredField {
	return shapeLayers(layerNoise(grid, seed, options), options);
}
