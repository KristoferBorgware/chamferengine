/**
 * What the terrain bench draws, as the named choices behind its selects.
 *
 * Each of these is a picture of the same ground rather than a different world,
 * so switching between them is a uniform or a redraw and never a rebuild.
 */

/** Which step of the build the preview stops at. */
export type PatchPicture =
	"ground" | "height" | "raw" | "terrain" | "mountain" | "erosion";

export const PATCH_PICTURES: readonly PatchPicture[] = [
	"ground",
	"height",
	"raw",
	"terrain",
	"mountain",
	"erosion",
] as const;

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
