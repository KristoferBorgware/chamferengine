/**
 * What the landscape bench draws, as the named choices behind its selects.
 *
 * Each of these is a picture of the same ground rather than a different world,
 * so switching between them is a uniform or a redraw and never a rebuild.
 */

/** Which step of the build the preview stops at. */
export type PatchPicture =
	"ground" | "height" | "raw" | "continent" | "erosion" | "peaks";

export const PATCH_PICTURES: readonly PatchPicture[] = [
	"ground",
	"height",
	"raw",
	"continent",
	"erosion",
	"peaks",
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
