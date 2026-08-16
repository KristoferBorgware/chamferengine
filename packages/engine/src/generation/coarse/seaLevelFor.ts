/**
 * The height that leaves `landFraction` of the surface above it.
 *
 * Taken as a percentile of the surface rather than fixed at zero, so a seed
 * whose noise happens to run high still gets oceans. Sorting a copy is exact
 * arithmetic and a fixed order, so the same field gives the same level on any
 * machine.
 *
 * The result is rounded to a value `float32` holds exactly, because the map is
 * stored as `float32` and "is this cell land" is asked of the stored height.
 * Rounding is monotone, so a cell at or below this level stays at or below it
 * once stored, and the two answers cannot disagree. Left unrounded, the one
 * cell sitting exactly at the percentile rounds up, reads as land, and has
 * nowhere to drain.
 */
export function seaLevelFor(
	height: Float64Array,
	landFraction: number,
): number {
	const sorted = Float64Array.from(height).sort();
	const at = Math.floor(sorted.length * (1 - landFraction));
	return Math.fround(sorted[Math.min(at, sorted.length - 1)]!);
}
