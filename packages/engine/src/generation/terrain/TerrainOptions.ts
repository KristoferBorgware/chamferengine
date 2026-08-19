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

	/** Metres above sea level at which the ground turns to snow. */
	readonly snowLine?: number;

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
	soilDepth: 4,
	snowLine: 240,
	caves: false,
	caveScale: 24,
	caveThreshold: 0.12,
	caveCeiling: 6,
} as const satisfies Required<TerrainOptions>;
