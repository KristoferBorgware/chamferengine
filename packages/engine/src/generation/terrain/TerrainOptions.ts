import type { TerrainLayer } from "../coarse/TerrainLayer.js";
import { CARVE_LAYER_DEFAULT } from "../coarse/TerrainLayer.js";
import { GROUND_LINES } from "./GROUND_LINES.js";

/**
 * The knobs on the terrain, all of them defaulted.
 *
 * **Nothing here decides where the ground is.** The map does, and this decides
 * only what the ground is made of and whether it is hollow. A knob that moved
 * the surface after the map was drawn was a knob whose effect could not be seen
 * on the map, which is how the height multiplier and the two detail knobs came
 * to be turned against each other with nothing to look at.
 */
export interface TerrainOptions {
	/** How deep the soil runs before stone starts, in blocks. */
	readonly soilDepth?: number;

	/**
	 * Metres above sea level at which the soil runs out and bare rock shows.
	 *
	 * Between this and the snow line is the band that reads as a mountainside
	 * rather than a green swell.
	 */
	readonly rockLine?: number;

	/** Metres above sea level at which the ground turns to snow. */
	readonly snowLine?: number;

	/**
	 * Whether the carve runs: cliffs, overhangs and arches cut into the ground
	 * the map placed.
	 *
	 * **The one thing here that does move the surface, and it only ever moves
	 * it down.** Nothing above the height the map drew is ever kept, so a spire
	 * is something the carve left standing rather than something it built --
	 * which is what keeps the map a true statement about the world.
	 *
	 * **Off by default, for the same reason caves are.** Every other knob here
	 * paints ground the map already placed, so a caller that asks for nothing
	 * gets a world whose surface is exactly the map's -- which is what every
	 * block-level guarantee in this package is stated against. A client that
	 * wants cliffs turns it on, and the panel does.
	 */
	readonly carveLayer?: boolean;

	/** The carve's own noise stack and the curve its reading is read through. */
	readonly carve?: TerrainLayer;

	/** Whether the density term runs. Caves cost 51x the height field. */
	readonly caves?: boolean;

	/** Size of a cave passage, in metres. */
	readonly caveScale?: number;

	/** How much of the noise range is open. Higher opens more. */
	readonly caveThreshold?: number;

	/** Metres below the surface at which caves start. */
	readonly caveCeiling?: number;
}

export const TERRAIN_DEFAULTS = {
	carveLayer: false,
	carve: CARVE_LAYER_DEFAULT,
	soilDepth: 4,
	rockLine: GROUND_LINES.rock,
	snowLine: GROUND_LINES.snow,
	caves: false,
	caveScale: 24,
	caveThreshold: 0.12,
	caveCeiling: 6,
} as const satisfies Required<TerrainOptions>;
