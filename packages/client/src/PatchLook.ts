/**
 * What the landscape bench draws, as the named choices behind its selects.
 *
 * Each of these is a picture of the same ground rather than a different world,
 * so switching between them is a uniform or a redraw and never a rebuild.
 */

/** Which step of the build the preview stops at. */
export type PatchPicture =
	"ground" | "height" | "raw" | "continent" | "erosion" | "peaks" | "carve";

export const PATCH_PICTURES: readonly PatchPicture[] = [
	"ground",
	"height",
	"raw",
	"continent",
	"erosion",
	"peaks",
	"carve",
] as const;

/**
 * The picture that shows one layer's own curve, or nothing for the rest.
 *
 * **A layer's picture is what its curve returned, never the raw reading.** The
 * curve is the whole of what a layer decides, so a picture drawn before it is a
 * picture a drag on the curve would not change.
 */
export const LAYER_PICTURES = {
	continent: "continent",
	erosion: "erosion",
	peaks: "peaks",
	carve: "carve",
} as const;

/** Whether the preview draws the surface, the cell rims, or both. */
export type PatchSurface = "solid" | "wire" | "both";

export const PATCH_SURFACES: readonly PatchSurface[] = [
	"solid",
	"wire",
	"both",
] as const;

/**
 * Whether the small map shows the patch or the whole planet.
 *
 * **The patch is one place and the planet is the world.** A patch a few
 * kilometres across says what the ground does underfoot and cannot say where
 * the continents are; the planet answers the second question, flat, because a
 * globe drawn small hides half of itself.
 */
export type PatchMap = "patch" | "planet";

export const PATCH_MAPS: readonly PatchMap[] = ["patch", "planet"] as const;

/** Which way the contour graph's sections run across the patch. */
export type PatchAlong = "x" | "z";

export const PATCH_ALONGS: readonly PatchAlong[] = ["x", "z"] as const;

/**
 * What the cave bench draws as the solid: the rock, or the caves themselves.
 *
 * **Turning the world inside out is the only view that shows a network from
 * outside it.** A cave is a hole, and a picture of the rock around a hole says
 * where the rock is; drawing the void as though it were stone says what shape
 * the passages are and where they join.
 */
export type CaveDraw = "rock" | "void";

export const CAVE_DRAWS: readonly CaveDraw[] = ["rock", "void"] as const;

/**
 * What the cave bench's plan picture shows.
 *
 * The field itself, the two edges of the band contoured over a square sample
 * grid, the hexagons the world is built out of, or the field with the hexagons
 * over it. **A sheet has no plan of its own** -- what it carves six metres down
 * is a different picture from what it carves twenty metres down -- so every one
 * of these is drawn at one named depth.
 */
export type CavePlan = "field" | "contour" | "hexes" | "both";

export const CAVE_PLANS: readonly CavePlan[] = [
	"field",
	"contour",
	"hexes",
	"both",
] as const;
