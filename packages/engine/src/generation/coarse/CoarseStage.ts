/**
 * The steps a coarse map is built in, in the order they run.
 *
 * Each one needs the one before it. Continents decide the scale of everything
 * downstream, sea level decides which cells are outlets, erosion cuts the
 * channels, and the flood and route describe the surface erosion left behind.
 */
export type CoarseStage = "height" | "sea" | "erosion" | "rivers" | "slope";

export const COARSE_STAGES: readonly CoarseStage[] = [
	"height",
	"sea",
	"erosion",
	"rivers",
	"slope",
] as const;

/** What to say while a stage runs. */
export const COARSE_STAGE_SAYS: Record<CoarseStage, string> = {
	height: "raising the continents",
	sea: "filling the sea",
	erosion: "cutting the valleys",
	rivers: "routing the rivers",
	slope: "reading the slopes",
};
