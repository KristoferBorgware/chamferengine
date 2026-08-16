/** The knobs on the terrain, all of them defaulted. */
export interface TerrainOptions {
	/** Metres of elevation one unit of the coarse map's height stands for. */
	readonly heightScale?: number;

	/** How far the fine detail moves the surface, in metres. */
	readonly detailAmplitude?: number;

	/** Noise frequency of the fine detail, in features per planet radius. */
	readonly detailFrequency?: number;

	readonly detailOctaves?: number;

	/** How deep the soil runs before stone starts, in blocks. */
	readonly soilDepth?: number;

	/** Metres above sea level at which the ground turns to snow. */
	readonly snowLine?: number;

	/**
	 * Ground fall per metre travelled above which a slope carries no soil.
	 *
	 * Dry land runs to a gradient of 0.68 and sits at 0.18 in the middle, so
	 * this is roughly the steepest 3% of the surface.
	 */
	readonly cliffGradient?: number;

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
	heightScale: 120,
	detailAmplitude: 5,
	detailFrequency: 60,
	detailOctaves: 4,
	soilDepth: 4,
	snowLine: 45,
	cliffGradient: 0.38,
	caves: false,
	caveScale: 24,
	caveThreshold: 0.12,
	caveCeiling: 6,
} as const satisfies Required<TerrainOptions>;
