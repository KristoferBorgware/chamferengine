import type { TerrainLayer } from "../coarse/TerrainLayer.js";
import { WATERLINE_REACH } from "./carveDensity.js";
import { CARVE_LAYER_DEFAULT } from "../coarse/TerrainLayer.js";
import { GROUND_LINES } from "./GROUND_LINES.js";

/**
 * The knobs on the terrain, all of them defaulted.
 *
 * **Nothing here decides where the ground is.** The map does, and this decides
 * only what the ground is made of and whether it is hollow. A knob that moved
 * the surface after the map was drawn was a knob whose effect could not be seen
 * on the map, which is how the height multiplier and the two detail knobs came
 * to be turned against each other with nothing to look at.
 */
export interface TerrainOptions {
	/**
	 * Whether the ground is stone all the way through, with no material rule
	 * at all.
	 *
	 * **For a world with nothing left to name its surface.** Soil, sand, the
	 * rock line and the snow line are what a world falls back on when no biome
	 * speaks, and a fallback that reads as a finished planet is a fallback
	 * nobody can tell from the real thing -- so where the biome model is the
	 * only thing allowed to say what the ground is made of, its absence has to
	 * look like an absence. Every block below is stone, sea bed and summit
	 * alike, and the elevations below are not read.
	 *
	 * **It moves no ground.** The height, the carve and the caves are all
	 * upstream of the material rule, so a world turned bare is the same shape
	 * as the world beside it in every block -- only grey.
	 */
	readonly bareRock?: boolean;

	/** How deep the soil runs before stone starts, in blocks. */
	readonly soilDepth?: number;

	/**
	 * Metres above sea level at which the soil runs out and bare rock shows.
	 *
	 * Between this and the snow line is the band that reads as a mountainside
	 * rather than a green swell.
	 */
	readonly rockLine?: number;

	/** Metres above sea level at which the ground turns to snow. */
	readonly snowLine?: number;

	/**
	 * Whether the carve runs: cliffs, overhangs and arches cut into the ground
	 * the map placed.
	 *
	 * **The one thing here that does move the surface, and it only ever moves
	 * it down.** Nothing above the height the map drew is ever kept, so a spire
	 * is something the carve left standing rather than something it built --
	 * which is what keeps the map a true statement about the world.
	 *
	 * **Off by default, for the same reason caves are.** Every other knob here
	 * paints ground the map already placed, so a caller that asks for nothing
	 * gets a world whose surface is exactly the map's -- which is what every
	 * block-level guarantee in this package is stated against. A client that
	 * wants cliffs turns it on, and the panel does.
	 */
	readonly carveLayer?: boolean;

	/** The carve's own noise stack and the curve its reading is read through. */
	readonly carve?: TerrainLayer;

	/**
	 * How far above sea level the carve takes to come back, in metres.
	 *
	 * **At and below the waterline the density is `1` and nothing is carved**,
	 * because what the layer opens down there fills, and a slot of water
	 * dropping through the crust reads as a fault rather than a cave. This is
	 * how far up that hold reaches: at a few metres it is a shoreline rule, and
	 * turned up it keeps the layer off the low ground entirely so cliffs and
	 * arches appear only on what stands well above the sea.
	 */
	readonly carveHold?: number;

	/** Whether the density term runs. Caves cost 51x the height field. */
	readonly caves?: boolean;

	/** Size of a cave passage, in metres. */
	readonly caveScale?: number;

	/** How much of the noise range is open. Higher opens more. */
	readonly caveThreshold?: number;

	/**
	 * Metres of rock kept over the roof of a cave, before the ceiling dips.
	 *
	 * The number {@link caveVary} comes off, so it is the deepest the ceiling
	 * ever sits rather than the depth it sits at.
	 */
	readonly caveCeiling?: number;

	/**
	 * How far the ceiling may come down from {@link caveCeiling}, in metres.
	 *
	 * **This is what gives a cave a way in.** A ceiling the same everywhere is
	 * a yes or a no on one number: at a few metres nothing ever breaks the
	 * ground and at zero the sheet opens it everywhere. A ceiling that wanders
	 * puts the decision somewhere. At `0` the ceiling is the constant one to
	 * the bit.
	 */
	readonly caveVary?: number;

	/**
	 * How high the ceiling field has to read before the ceiling moves at all.
	 *
	 * A rarity, from `0` -- the ceiling dips over the whole world -- to just
	 * under `1`. It cannot be a constant: over any patch smaller than the
	 * planet the field never sees its own full range, so what share of the
	 * ground clears a given figure depends on how wide the shapes are.
	 *
	 * **Measured over the whole sphere rather than over a patch.** At the
	 * shipped `6 m` ceiling and `10 m` dip, the share of the planet whose
	 * ceiling reaches within half a block of the surface runs `1.153%` at
	 * `0.2`, `0.346%` at `0.4`, `0.170%` at `0.5` and `0.021%` at `0.7` --
	 * against `0.19%` of the ground the cave lab's own trial opened. `0.5` is
	 * the figure that reproduces it; `0.7` is what that trial asked for, and
	 * over its 95 m patch that number meant something else entirely.
	 */
	readonly caveRare?: number;

	/** Metres over which the ceiling changes, which is how wide a dip is. */
	readonly caveMouthScale?: number;

	/**
	 * How far under the surface caves reach, in metres.
	 *
	 * **What makes caves affordable at all.** The cave field is read once a
	 * *block*, because a passage is free to be at any depth and there is
	 * nothing about the ground that says where one is -- so without a floor
	 * every column has to be evaluated to the bottom of the crust. On the
	 * shipped world that is `1,232` blocks a column against about ten with
	 * caves off; at the default it is twenty-eight. Below it the crust is
	 * solid and the generator fills it rather than asking.
	 *
	 * The same shape of bound the carve carries in `CARVE_REACH`, and stated
	 * in metres for the same reason: it is a depth in the world rather than a
	 * count of blocks, so changing the block size does not move it.
	 */
	readonly caveDepth?: number;
}

export const TERRAIN_DEFAULTS = {
	bareRock: false,
	carveLayer: false,
	carve: CARVE_LAYER_DEFAULT,
	carveHold: WATERLINE_REACH * CARVE_LAYER_DEFAULT.metres,
	soilDepth: 4,
	rockLine: GROUND_LINES.rock,
	snowLine: GROUND_LINES.snow,
	caves: false,
	caveScale: 24,
	caveThreshold: 0.12,
	caveCeiling: 6,
	caveVary: 0,
	caveRare: 0.5,
	caveMouthScale: 60,
	caveDepth: 28,
} as const satisfies Required<TerrainOptions>;
