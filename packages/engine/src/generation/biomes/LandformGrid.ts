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
 * **Three of the four axes are shape; the fourth is size.** How far inland a
 * place is, how much erosion took away and how far the relief swings all say
 * what a place is *like*, and none of them says how far above the sea it
 * ends up -- so a landform whose meaning includes height could not be
 * written down. `peaks` meant *sharp*, which named a summit and a small
 * steep butte with the same reading, and the two grounds filed to it are
 * bare rock and snow. The height axis is what lets the grid say the thing
 * itself rather than a rule bolted on beside it.
 *
 * The first three edges are fixed numbers rather than shares of the world, so
 * a grid means the same thing on every planet; how much land actually falls
 * in each cell is a measurement a bench reads back. On the default layers
 * they cut land into roughly even parts: continentalness runs 0.46 to 0.89
 * between its 2nd and 98th percentiles, erosion 0.04 to 0.95, and peaks and
 * valleys 0.24 to 0.91. {@link RISE_EDGES} is the one that cannot be fixed
 * in the same way, and says why.
 */
export const CONT_EDGES: readonly number[] = [0.69];
export const ERO_EDGES: readonly number[] = [0.3, 0.68];
export const PV_EDGES: readonly number[] = [0.38, 0.76];

/**
 * Where the height reading is cut, as a share of the world's tallest ground.
 *
 * **A share and not metres, because the other three axes are shapes and this
 * one is a size.** A curve's answer means the same thing on every planet; a
 * height does not, so it is measured against the ground the world actually
 * reaches. Measured over four seeds at reliefs of 300, 600 and 900 m, land
 * divides into near-thirds at `0.15` and `0.35` on all three -- the 33rd
 * percentile reads `0.15 / 0.14 / 0.14` and the 67th `0.36 / 0.34 / 0.33`.
 * A metre edge would have cut a tall world into thirds and a low one into
 * one band.
 */
export const RISE_EDGES: readonly number[] = [0.15, 0.35];

export const CONT_NAMES: readonly string[] = ["near the sea", "inland"];
export const ERO_NAMES: readonly string[] = ["sharp", "middling", "worn"];
export const PV_NAMES: readonly string[] = ["valley", "middling", "peak"];
export const RISE_NAMES: readonly string[] = ["low", "middling", "high"];

export const CONT_BANDS = CONT_EDGES.length + 1;
export const ERO_BANDS = ERO_EDGES.length + 1;
export const PV_BANDS = PV_EDGES.length + 1;
export const RISE_BANDS = RISE_EDGES.length + 1;

/** How many cells a whole grid has, which is what a grid string must be long. */
export const GRID_CELLS = CONT_BANDS * RISE_BANDS * ERO_BANDS * PV_BANDS;

/** How long a grid was before the height axis, for a link written back then. */
export const GRID_CELLS_FLAT = CONT_BANDS * ERO_BANDS * PV_BANDS;

/**
 * A landform grid: one digit per cell, each an index into `LANDFORMS`.
 *
 * A string rather than an array so it travels in a query string unchanged, and
 * so two grids compare with `===`.
 */
export type LandformGrid = string;

/**
 * The grid the model ships with: a sheet per continentalness and height, each
 * a row per erosion band and a column per relief band.
 *
 * **Height is what says peak and plateau, and the other three say the rest.**
 * Sharp ground high up is a range; the same sharpness low down is a hillside,
 * which is a slope. Worn ground high up is a plateau; the same worn ground
 * low down is lowland. Neither can be written without this axis.
 *
 * **It is authored to build the world it already built**, and that is worth
 * knowing rather than hiding: five of the fifty-four cells differ from the
 * old grid spread across the new axis, and the shares they move are under a
 * tenth of a point -- lowlands `56.0%`, slopes `17.3%`, valleys `12.4%`,
 * plateau `9.8%`, peaks `3.3%`, shore `1.2%`, the same figures to the digit.
 * The three shape axes already correlated with height on this grid, which is
 * exactly why the fault was hard to see. What changes is that a peak is now
 * *required* to stand in the top band rather than happening to, and a reader
 * can see the requirement and move it.
 *
 * **The near-the-sea sheet is the one place the axis is left unused.** Its
 * sharp column tops out at slopes in all three height bands, which is the
 * old grid's reasoning -- a coast is usually low, so there is no room for a
 * range. That reasoning is a height rule wearing continentalness, and the
 * height axis now says it directly: turning the `3` in the high sheet's
 * sharp column into a `5` gives a high coast its range, which measures
 * `4.2%` peaks against `3.3%`, every one of the new ones above a third of
 * the tallest ground.
 */
export const DEFAULT_LANDFORM_GRID: LandformGrid = [
	// near the sea, low: valleys where the relief dips, slopes where it
	// swings, and lowland everywhere the ground is worn.
	"133" + "223" + "222",
	// near the sea, middling
	"133" + "223" + "222",
	// near the sea, high: worn ground this high is a plateau, and the sharp
	// column still tops out at slopes -- see the note above.
	"133" + "223" + "224",
	// inland, low: nothing this low is a peak or a plateau, whatever the
	// relief swings.
	"133" + "122" + "222",
	// inland, middling
	"133" + "124" + "224",
	// inland, high: the one sheet that names a peak.
	"135" + "124" + "224",
].join("");
