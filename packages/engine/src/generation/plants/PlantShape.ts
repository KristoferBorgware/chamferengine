/**
 * One kind of plant, as the numbers a grower reads.
 *
 * **A species is a bundle of numbers, never authored geometry.** Every plant on
 * a planet comes out of this one grower, so two species differ by what is
 * written here and by nothing else -- which is what lets a reader drag one into
 * something the list does not hold.
 *
 * Lengths are metres and angles are radians. Nothing here knows how wide a
 * block is: a skeleton is geometry, and turning it into cells is a separate
 * step.
 */
export interface PlantShape {
	/** How tall the trunk grows, before its own size hash scales it. */
	readonly height: number;

	/** The trunk's radius at the ground. */
	readonly trunk: number;

	/** The radius left at the top of each length of branch. */
	readonly taper: number;

	/** Bare trunk under this fraction of the height. */
	readonly first: number;

	/** How many branches leave each split. */
	readonly children: number;

	/** How far a child leans off its parent's heading, in radians. */
	readonly spread: number;

	/** What a child keeps of its parent's length and of its radius. */
	readonly lengthRatio: number;
	readonly radiusRatio: number;

	/** How many times a limb splits before it ends in a leaf cluster. */
	readonly levels: number;

	/** How far a limb rises over its own length, and how far it falls. */
	readonly up: number;
	readonly droop: number;

	/** How far the noise pushes each step of a limb off its heading. */
	readonly bend: number;

	/** How far you walk before the bend changes its mind, in metres. */
	readonly bendFeature: number;

	/** Whether the plant splits at all, and whether it carries leaves. */
	readonly branches: boolean;
	readonly leaves: boolean;

	/** The radius of one leaf cluster, in metres. */
	readonly leafRadius: number;

	/** How much of a cluster's ball is filled, and how far noise cuts into it. */
	readonly leafFill: number;
	readonly leafRough: number;

	/**
	 * How much of a cluster sits at a limb's tip rather than along it.
	 *
	 * At `1` a limb carries one cluster, at its end. Below it a second cluster
	 * of the remaining share hangs half way along, which is what fills a crown
	 * rather than stringing balls round its rim.
	 */
	readonly leafTip: number;

	/** How far one plant's size may drift from the height above, either way. */
	readonly sizeSpread: number;
}
