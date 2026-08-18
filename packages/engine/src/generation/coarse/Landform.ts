/**
 * Which way a planet decides where its land is.
 *
 * The four differ in what they can be asked for and what they cost, and the
 * measurements are in `verification/coastline.js`. Raggedness below is the rate
 * a coastline's length grows as the cells halve: a curve carrying no detail
 * under the map's own resolution doubles exactly, so `1.00` is smooth and the
 * excess is what ragged means as a number.
 *
 * | | raggedness | land fraction | largest landmass | longest river |
 * |---|---|---|---|---|
 * | `noise` | 1.06–1.12 | exact | 27,305 | 172 |
 * | `warped` | 1.13–1.17 | exact | 26,913 | 153 |
 * | `grown` | 1.40–1.45 | near, not on | 14,910 | 83 |
 * | `plates` | 1.18–1.50 | exact | 25,072 | 94 |
 *
 * Real coasts, quoted and not measured here, run from about 1.05 for South
 * Africa through 1.25 for Britain to about 1.52 for Norway.
 */
export type Landform = "noise" | "warped" | "grown" | "plates";

export const LANDFORMS: readonly Landform[] = [
	"noise",
	"warped",
	"grown",
	"plates",
] as const;

/** What each one is, in a line. */
export const LANDFORM_SAYS: Record<Landform, string> = {
	noise: "Two tiers of noise, cut at the height that leaves the asked-for land above it. Rounded coasts, few islands, one big continent and the longest rivers.",
	warped: "The same cut, with the sample point pushed about by a second noise field first. Folds the coastline without changing what it is made of.",
	grown: "Land grown from scattered seeds, level by level, each step flipping cells against their neighbours. The most ragged coast and the most islands, and the only one that cannot be told exactly how much land to leave.",
	plates: "A few dozen plates, each drifting and each ocean floor or continent. Ranges rise where two close and rifts drop where two part, so a mountain is somewhere for a reason.",
};
