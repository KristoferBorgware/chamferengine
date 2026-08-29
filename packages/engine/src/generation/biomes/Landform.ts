/**
 * The kinds of ground the terrain names, before the climate names a biome.
 *
 * **Two stages, and the terrain goes first.** Temperature and humidity alone
 * cannot say that a place is a mountain -- measured over a shipped world,
 * altitude drags the median temperature of peaks only 0.033 of the climate
 * square below the lowlands' -- so a diagram read on climate alone puts a
 * desert on a summit. The three terrain layers decide the landform, and the
 * climate then only chooses which kind of that landform this one is: a cold
 * peak and a hot peak are both peaks.
 *
 * The sea is not one of these. There is no land there for a biome to stand on,
 * and the ocean is a surface rather than ground.
 */
export interface Landform {
	/** The name a biome definition files itself under. */
	readonly key: string;

	readonly name: string;

	/** A three-letter label for a grid cell. */
	readonly short: string;

	/** The landform's own color on a map of landforms, as sRGB hex. */
	readonly hex: string;
}

/** The six landforms, in the order their indices are stored. */
export const LANDFORMS: readonly Landform[] = [
	{ key: "shore", name: "Shore", short: "shr", hex: "e0d3a8" },
	{ key: "valleys", name: "Valleys", short: "val", hex: "4e7a4a" },
	{ key: "lowlands", name: "Lowlands", short: "low", hex: "9ab06a" },
	{ key: "slopes", name: "Slopes", short: "slp", hex: "7f8a72" },
	{ key: "plateau", name: "Plateau", short: "plt", hex: "c0a878" },
	{ key: "peaks", name: "Peaks", short: "pk", hex: "e4ebf2" },
];

/** The landform index the shore rule returns, ahead of anything in the grid. */
export const SHORE = 0;

/** The landform key a biome carries when the landform does not restrict it. */
export const ANY_LANDFORM = "any";
