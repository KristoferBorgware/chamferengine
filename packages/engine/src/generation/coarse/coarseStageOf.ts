import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import type { CoarseStage } from "./CoarseStage.js";

/**
 * Which step of the build a change to one option first reaches.
 *
 * The steps form a chain and most options do not enter it at the top, so a
 * builder holding each step's output can start part way down. Land and relief
 * only reach the metre scale, and erosion only reaches erosion, so neither
 * costs the noise field again.
 *
 * `level` and `cellMetres` are not here. Both rebuild the grid, which is the
 * one thing held across every build, so neither is a stage a run can start
 * from.
 */
export function coarseStageOf(option: keyof CoarseMapOptions): CoarseStage {
	switch (option) {
		case "frequency":
		case "octaves":
		case "persistence":
		case "lacunarity":
		case "offsetX":
		case "offsetY":
		case "level":
		case "cellMetres":
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
		case "relief":
			return "metres";
		case "erosion":
			return "erosion";
	}
}
