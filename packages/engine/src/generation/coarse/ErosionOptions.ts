/**
 * What a droplet pass takes beyond the map and the seed.
 *
 * Two of the constants are here because they decide the character of the
 * result rather than being facts about water, and the last two are so a caller
 * can run part of the droplets. Droplets run one after another, so a contiguous
 * range is the same arithmetic in the same order as the whole run: a pass split
 * into slices leaves exactly the field one call would.
 */
export interface ErosionOptions {
	/** The most of one step's fall a single droplet may cut, as a fraction. */
	readonly maxCut?: number;

	/** What a cell keeps of the material cut from it. `cell` walk only. */
	readonly cutShare?: number;

	/** How much of the previous direction a droplet keeps. `free` walk only. */
	readonly inertia?: number;

	/** The first droplet to run. */
	readonly from?: number;

	/** How many droplets to run from there. */
	readonly take?: number;
}
