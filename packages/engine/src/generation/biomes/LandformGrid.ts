/**
 * Where each terrain reading is cut into indices, and the grid those indices
 * select a landform from.
 *
 * **The values cut here are the curves' answers, not the raw noise.** A layer
 * is a stack of octaves read through a curve, and the curve is what gives the
 * reading a meaning -- how high the continent stands, how much erosion takes
 * away, how far the relief swings. The raw noise underneath is the same shape
 * for all three.
 *
 * The edges are fixed numbers rather than shares of the world, so a grid means
 * the same thing on every planet; how much land actually falls in each cell is
 * a measurement a bench reads back. On the default layers they cut land into
 * roughly even parts: continentalness runs 0.46 to 0.89 between its 2nd and
 * 98th percentiles, erosion 0.04 to 0.95, and peaks and valleys 0.24 to 0.91.
 */
export const CONT_EDGES: readonly number[] = [0.69];
export const ERO_EDGES: readonly number[] = [0.3, 0.68];
export const PV_EDGES: readonly number[] = [0.38, 0.76];

export const CONT_NAMES: readonly string[] = ["near the sea", "inland"];
export const ERO_NAMES: readonly string[] = ["sharp", "middling", "worn"];
export const PV_NAMES: readonly string[] = ["valley", "middling", "peak"];

export const CONT_BANDS = CONT_EDGES.length + 1;
export const ERO_BANDS = ERO_EDGES.length + 1;
export const PV_BANDS = PV_EDGES.length + 1;

/**
 * A landform grid: one digit per cell, each an index into `LANDFORMS`.
 *
 * A string rather than an array so it travels in a query string unchanged, and
 * so two grids compare with `===`.
 */
export type LandformGrid = string;

/**
 * The grid the model ships with, continentalness sheet by sheet.
 *
 * Near the sea the ground is low and there is no room for a range, so the
 * sharp relief column tops out at slopes; inland the same column runs from
 * valleys through slopes to peaks, and worn ground is lowland or plateau
 * whatever the relief says.
 */
export const DEFAULT_LANDFORM_GRID: LandformGrid = [
	// near the sea
	"133" + "223" + "222",
	// inland
	"135" + "124" + "224",
].join("");
