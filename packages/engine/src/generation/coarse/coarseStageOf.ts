import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import type { CoarseStage } from "./CoarseStage.js";

/**
 * Which step of the build a change to one option first reaches.
 *
 * The steps form a chain and most options do not enter it at the top, so a
 * builder holding each step's output can start part way down. Land only
 * reaches sea level, and erosion rate only reaches erosion, so neither costs
 * the height field again.
 *
 * `level` is not here. Changing it rebuilds the grid, which is the one thing
 * held across every build, so it is not a stage a run can start from.
 */
export function coarseStageOf(option: keyof CoarseMapOptions): CoarseStage {
	switch (option) {
		case "continentFrequency":
		case "continentOctaves":
		case "reliefFrequency":
		case "reliefOctaves":
		case "reliefAmplitude":
		case "level":
		// Every landform option decides the surface itself, so all of them
		// enter at the top of the chain.
		case "landform":
		case "warpAmplitude":
		case "warpFrequency":
		case "creation":
		case "island":
		case "growthWeight":
		case "plates":
		case "oceanShare":
		case "biasWeight":
		case "upliftWeight":
		case "upliftReach":
			return "height";
		case "landFraction":
			return "sea";
		case "erosionPasses":
		case "erosionRate":
			return "erosion";
	}
}
