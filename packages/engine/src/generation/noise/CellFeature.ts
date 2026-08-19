/**
 * Which distance the cellular basis reports.
 *
 * `f1` is the distance to the nearest feature point, which draws a field of
 * rounded plates with a low point at each point and a rise between them.
 * `f2f1` is the gap between the nearest two, which is near zero exactly on the
 * boundary between two plates and rises away from it, so it draws the seams
 * themselves as a network of lines.
 */
export type CellFeature = "f1" | "f2f1";

export const CELL_FEATURES: readonly CellFeature[] = ["f1", "f2f1"] as const;
