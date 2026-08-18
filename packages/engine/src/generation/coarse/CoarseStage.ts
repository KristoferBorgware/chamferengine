/**
 * The steps a coarse map is built in, in the order they run.
 *
 * Each one needs the one before it. The noise decides the shape of everything
 * downstream, sea level and the metre scale turn it into ground, water cuts
 * into that ground, and the slopes are read off what is left.
 *
 * **There is no rivers step.** Filling every basin, pointing every cell
 * downhill and counting what drains through it was three passes and two fields
 * that produced lakes nobody wanted and rivers nobody could see. Erosion here
 * runs water over the ground without routing it.
 */
export type CoarseStage = "height" | "metres" | "erosion" | "slope";

export const COARSE_STAGES: readonly CoarseStage[] = [
	"height",
	"metres",
	"erosion",
	"slope",
] as const;

/** What to say while a stage runs. */
export const COARSE_STAGE_SAYS: Record<CoarseStage, string> = {
	height: "raising the ground",
	metres: "filling the sea",
	erosion: "cutting the valleys",
	slope: "reading the slopes",
};
