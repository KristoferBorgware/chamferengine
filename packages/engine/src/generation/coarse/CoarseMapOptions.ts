import type { ErosionWalk } from "./ErosionWalk.js";
import type { TerrainLayer } from "./TerrainLayer.js";
import { DROPLET } from "./DROPLET.js";
import {
	MOUNTAIN_LAYER_DEFAULT,
	TERRAIN_LAYER_DEFAULT,
} from "./TerrainLayer.js";

/** How the mountain layer reaches the ground. */
export type MountainMerge = "gated" | "roughen";

export const MOUNTAIN_MERGES: readonly MountainMerge[] = [
	"gated",
	"roughen",
] as const;

/**
 * The knobs on a coarse map, all of them defaulted.
 *
 * **Every one of these shows in the map picture.** A knob whose effect can only
 * be found by walking the finished world is a knob nobody can set, which is why
 * there is no longer a detail tier, no separate relief frequency, and no height
 * multiplier applied after the map was drawn.
 */
export interface CoarseMapOptions {
	/** Subdivision level of the map. Level 8 is 655,362 cells and 2.5 MB a field. */
	readonly level?: number;

	/** Metres across one cell of the map, which is what makes its heights metric. */
	readonly cellMetres?: number;

	/** The layer that draws the land: continents at its widest, ground at its narrowest. */
	readonly terrain?: TerrainLayer;

	/** The layer that draws the ranges. */
	readonly mountain?: TerrainLayer;

	/** Whether the mountain layer runs at all. */
	readonly mountainLayer?: boolean;

	/** How the mountain layer reaches the ground. */
	readonly merge?: MountainMerge;

	/**
	 * Where the gate opens, as a fraction of the terrain curve's own reach.
	 *
	 * `gated` only. Nothing at or below it, all of the mountain layer at the
	 * top of that curve, smoothed between.
	 */
	readonly mountainLine?: number;

	/**
	 * The balance between the two layers.
	 *
	 * A ratio rather than a number of metres, which is F-052 and is open: what
	 * it buys in metres moves with the terrain curve, because the metre step
	 * divides by the field's own peak.
	 */
	readonly detail?: number;

	/** Metres from sea level to the tallest ground, before the peak scale. */
	readonly relief?: number;

	/** Metres from sea level down to the deepest sea floor. */
	readonly seaDepth?: number;

	/** Fraction of the surface left above sea level. Earth is near 0.3. */
	readonly landFraction?: number;

	/**
	 * Metres the water is dropped below the level `landFraction` chose. Never
	 * above zero.
	 *
	 * **Land and this are different questions.** `landFraction` is the
	 * percentile every height is measured from, so moving it moves the ground.
	 * This moves only the water, leaving every height exactly where it was --
	 * the same picture as draining that much ocean -- and what comes out from
	 * under it is the shallow floor that was already there.
	 */
	readonly seaLevel?: number;

	/**
	 * How hard the water cuts. Zero leaves the noise exactly as it fell.
	 *
	 * **Zero by default, and that is a decision rather than a placeholder.**
	 * Neither walk passes the test a carving pass has to pass -- the median
	 * hillslope has to hold while the tail grows, and at full strength `cell`
	 * takes the median up `1.40x` and `free` up `1.11x`. A world is better
	 * without that until one of them sits at one. The pass returns on its first
	 * line when this is zero.
	 */
	readonly erosion?: number;

	/** How a droplet moves over the map. */
	readonly erosionWalk?: ErosionWalk;

	/** The most of one step's fall a single droplet may cut, as a fraction. */
	readonly erosionMaxCut?: number;

	/** What a cell keeps of the material cut from it. `cell` walk only. */
	readonly erosionCutShare?: number;

	/** How much of the previous direction a droplet keeps. `free` walk only. */
	readonly erosionInertia?: number;
}

export const COARSE_MAP_DEFAULTS = {
	level: 8,
	cellMetres: 32,
	terrain: TERRAIN_LAYER_DEFAULT,
	mountain: MOUNTAIN_LAYER_DEFAULT,
	mountainLayer: true,
	merge: "gated",
	mountainLine: 0.5,
	detail: 7,
	relief: 1100,
	seaDepth: 130,
	landFraction: 0.65,
	seaLevel: 0,
	erosion: 0,
	erosionWalk: "cell",
	erosionMaxCut: DROPLET.maxCut,
	erosionCutShare: DROPLET.cutShare,
	erosionInertia: DROPLET.inertia,
} as const satisfies Required<CoarseMapOptions>;
