/**
 * The steps a coarse map is built in, in the order they run.
 *
 * The second needs the first: the three octave stacks decide the shape of
 * everything downstream, and the curves and the metre knobs are read off them.
 *
 * **The split is about what a drag costs.** The stacks answer to the seed and
 * the layer widths alone and are the expensive half; every curve, every switch
 * and every metre knob is the cheap one, run over fields already in memory.
 *
 * **There is no rivers step, no slope step and no droplet step.** Filling every
 * basin, pointing every cell downhill and counting what drains through it was
 * three passes and two fields that produced lakes nobody wanted and rivers
 * nobody could see. The slope was a fourth field with one reader. And the
 * droplet walk never passed the test a carving pass has to pass -- the median
 * hillslope has to hold while the tail grows, and neither walk managed it --
 * so the erosion in this model is a *field*, read through a curve, which says
 * how much relief a place keeps.
 */
export type CoarseStage = "height" | "metres";

export const COARSE_STAGES: readonly CoarseStage[] = [
	"height",
	"metres",
] as const;

/** What to say while a stage runs. */
export const COARSE_STAGE_SAYS: Record<CoarseStage, string> = {
	height: "reading the fields",
	metres: "raising the ground",
};
