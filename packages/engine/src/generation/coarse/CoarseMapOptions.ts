import type { TerrainLayer } from "./TerrainLayer.js";
import {
	CONTINENT_LAYER_DEFAULT,
	EROSION_LAYER_DEFAULT,
	PEAKS_LAYER_DEFAULT,
} from "./TerrainLayer.js";

/**
 * The knobs on a coarse map, all of them defaulted.
 *
 * **Every one of these shows in the map picture.** A knob whose effect can only
 * be found by walking the finished world is a knob nobody can set, which is why
 * there is no longer a detail tier, no separate relief frequency, and no height
 * multiplier applied after the map was drawn.
 */
export interface CoarseMapOptions {
	/** Subdivision level of the map. Level 8 is 655,362 cells and 2.5 MB a field. */
	readonly level?: number;

	/** Metres across one cell of the map, which is what makes its heights metric. */
	readonly cellMetres?: number;

	/** The layer that sets the level: where the land is and where the sea is. */
	readonly continent?: TerrainLayer;

	/**
	 * The layer that says how much of the relief survives in each place.
	 *
	 * **Not the droplets.** This is a field over the planet read through a
	 * curve: it decides, per place, how much of the relief peaks and valleys is
	 * allowed to put there and how far the level is worn down with it, and it
	 * costs one noise stack. `droplets` below is a wholly separate thing -- a
	 * walk that moves material downhill over the finished map, off by default,
	 * and the slowest step of a build by a wide margin. They shared a name once
	 * and that is the only relation between them.
	 */
	readonly erosion?: TerrainLayer;

	/** The layer that is the relief itself, signed about the level. */
	readonly peaks?: TerrainLayer;

	/** Whether each layer reaches the height at all. */
	readonly continentLayer?: boolean;
	readonly erosionLayer?: boolean;
	readonly peaksLayer?: boolean;

	/**
	 * How much of the level erosion takes with the relief, `0` to `1`.
	 *
	 * Water wears a range down as well as smoothing it, and in a model where
	 * the height is one function of all three fields, erosion changes the level
	 * by construction. Flattened into one line it has to be a term of its own.
	 */
	readonly erosionBite?: number;

	/** Metres from the continentalness curve's middle to the tallest ground. */
	readonly relief?: number;

	/** Metres from that middle down to the deepest sea floor. */
	readonly seaDepth?: number;

	/** Metres a full peak stands over the level the continent set. */
	readonly peakRelief?: number;

	/**
	 * Metres the water is moved from the curve's own middle. Below zero drains.
	 *
	 * **The coast is where the continentalness curve crosses its middle**, and
	 * this is the one thing that moves the water off it -- lifting the whole
	 * field rather than moving any of it, which is the same picture as draining
	 * that much ocean.
	 */
	readonly seaLevel?: number;
}

export const COARSE_MAP_DEFAULTS = {
	level: 8,
	cellMetres: 32,
	continent: CONTINENT_LAYER_DEFAULT,
	erosion: EROSION_LAYER_DEFAULT,
	peaks: PEAKS_LAYER_DEFAULT,
	continentLayer: true,
	erosionLayer: true,
	peaksLayer: true,
	erosionBite: 0.55,
	relief: 800,
	seaDepth: 360,
	peakRelief: 220,
	seaLevel: 0,
} as const satisfies Required<CoarseMapOptions>;
