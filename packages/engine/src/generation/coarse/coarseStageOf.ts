import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import type { CoarseStage } from "./CoarseStage.js";

/**
 * Which step of the build a change to one option first reaches.
 *
 * The steps form a chain and most options do not enter it at the top, so a
 * builder holding each step's output can start part way down. **A curve and a
 * metre knob never cost the noise field again**: the stacks answer to the seed
 * and the layer widths alone, and everything read off them -- every curve,
 * every switch, relief, the sea and the peak scale -- is the second pass.
 *
 * `level` and `cellMetres` are not here. Both rebuild the grid, which is the
 * one thing held across every build, so neither is a stage a run can start
 * from.

 */
export function coarseStageOf(option: keyof CoarseMapOptions): CoarseStage {
	switch (option) {
		// The octave stacks, which is everything the noise itself depends on.
		case "continent":
		case "erosion":
		case "peaks":
		case "level":
		case "cellMetres":
			return "height";
		case "continentLayer":
		case "erosionLayer":
		case "peaksLayer":
		case "erosionBite":
		case "relief":
		case "seaDepth":
		case "peakRelief":
		case "seaLevel":
			return "metres";
	}
}
