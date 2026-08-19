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
		case "ridge":
		case "offsetX":
		case "offsetY":
		case "level":
		case "cellMetres":
		// Every option that decides the surface itself enters at the top of
		// the chain.
		case "basis":
		case "warpAmplitude":
		case "warpFrequency":
		case "spin":
		case "jitter":
		case "feature":
			return "height";
		case "landFraction":
		case "relief":
		case "seaDepth":
			return "metres";
		case "erosion":
			return "erosion";
	}
}
