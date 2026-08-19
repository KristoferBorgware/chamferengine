/**
 * The steps a coarse map is built in, in the order they run.
 *
 * Each one needs the one before it. The noise decides the shape of everything
 * downstream, sea level and the metre scale turn it into ground, and water cuts
 * into that ground.
 *
 * **There is no rivers step and no slope step.** Filling every basin, pointing
 * every cell downhill and counting what drains through it was three passes and
 * two fields that produced lakes nobody wanted and rivers nobody could see;
 * erosion here runs water over the ground without routing it. The slope was a
 * fourth field with one reader, and that reader is gone too.
 */
export type CoarseStage = "height" | "metres" | "erosion";

export const COARSE_STAGES: readonly CoarseStage[] = [
	"height",
	"metres",
	"erosion",
] as const;

/** What to say while a stage runs. */
export const COARSE_STAGE_SAYS: Record<CoarseStage, string> = {
	height: "raising the ground",
	metres: "filling the sea",
	erosion: "cutting the valleys",
};
