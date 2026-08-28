/**
 * One plant as geometry, before anything decides which cells it fills.
 *
 * **The two steps answer different questions.** A skeleton is rods and balls in
 * world metres; turning those into cells goes through the position-to-cell
 * pipeline and depends on how finely the ground is being drawn. Keeping them
 * apart is what lets one plant be rasterised into two different lattices and
 * come out as the same tree.
 *
 * Both lists are flat rather than one array per piece: a stand holds hundreds
 * of thousands of rods, and an array apiece is an allocation apiece.
 */
export interface PlantSkeleton {
	/** Eight numbers a rod: two end points, then the radius at each end. */
	readonly rods: number[];

	/** Four numbers a cluster: its centre, then its radius. */
	readonly clusters: number[];
}

/** An empty skeleton, which one plant is grown into and then read out of. */
export function emptySkeleton(): PlantSkeleton {
	return { rods: [], clusters: [] };
}
