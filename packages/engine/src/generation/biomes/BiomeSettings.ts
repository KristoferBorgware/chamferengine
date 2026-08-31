import type { ClimateFit } from "./ClimateFit.js";

/**
 * The knobs on the biome model, all of them defaulted.
 *
 * **Nothing here moves the ground.** The terrain layers decide where the land
 * is and how high it stands; these decide only how the climate is read over it
 * and how the readings are turned into names.
 */
export interface BiomeSettings {
	/** How much latitude decides temperature: `+1` on the equator, `-1` at a pole. */
	readonly tempEquator?: number;

	/** Units of temperature the ground loses per kilometre it stands up. */
	readonly tempLapse?: number;

	/** How much a noise field moves the temperature off its latitude. */
	readonly tempNoise?: number;

	/** Metres across the temperature noise's widest octave. */
	readonly tempFeature?: number;

	readonly tempOctaves?: number;

	/**
	 * How much distance from the coast dries the air.
	 *
	 * **Humidity is read off continentalness, because continentalness is the
	 * distance from the coast.** A true distance to the nearest ocean is a
	 * flood fill over the map, and a flood fill is a global query: whether a
	 * cell is wet would depend on a chain of cells running three chunks away,
	 * which terrain generated a chunk at a time cannot answer. The field that
	 * already says *how far inland am I* is one reading.
	 */
	readonly humOcean?: number;

	/** How much a noise field moves the humidity off the continent term. */
	readonly humNoise?: number;

	/** Metres across the humidity noise's widest octave. */
	readonly humFeature?: number;

	readonly humOctaves?: number;

	/**
	 * Units of humidity the air loses per kilometre of elevation.
	 *
	 * **The one climate term the landform grid has no equivalent for.**
	 * Temperature already cools with height (`tempLapse`); nothing dried the
	 * air the same way, so a cold, wet reading could still land on a summit.
	 * Zero leaves humidity exactly as it reads at sea level, whatever the
	 * ground stands on.
	 */
	readonly humLapse?: number;

	/**
	 * How hard a belt of latitude either side of the equator is dried.
	 *
	 * **The one term that says *be arid here*.** Every other humidity term
	 * reads the ground: how far inland a place is, how high it stands, and
	 * noise. None of them can put a desert at a latitude, and Earth's sit in
	 * belts because air that rises wet over the equator comes back down dry a
	 * little way off it.
	 *
	 * **It moves moisture rather than removing it**, which is what that
	 * circulation actually does and what keeps this from being a second
	 * wetness knob: the belt is dried and everywhere else is wetted by the
	 * belt's own share of the sphere, so the planet's mean humidity does not
	 * move and turning it up cannot dry the whole world. Zero is bit-for-bit
	 * the world without it.
	 */
	readonly humBelt?: number;

	/**
	 * Where the dry belts sit, as the sine of their latitude.
	 *
	 * The sine rather than the angle because area on a sphere is uniform in
	 * it -- half the world lies inside `0.5` -- so a belt of a given width
	 * here covers the same amount of ground wherever it is put. `0` is the
	 * equator and `1` is a pole.
	 */
	readonly humBeltAt?: number;

	/** How far either side of {@link humBeltAt} the drying reaches, in the same units. */
	readonly humBeltWidth?: number;

	/**
	 * Whether the biome lookup is pushed off the climate it was handed.
	 *
	 * The push frays every border in the diagram; without it each border is
	 * the contour of a smooth field and reads as one.
	 */
	readonly warp?: boolean;

	/** How far the push moves the lookup, in the diagram's own 0-to-1 square. */
	readonly warpStrength?: number;

	/** Metres across the push's widest octave. */
	readonly warpFeature?: number;

	readonly warpOctaves?: number;

	/**
	 * Whether the climate square is stretched onto the land the planet has.
	 *
	 * Every climate term is a noise stack or a weighted sum of them, and a
	 * stack normalized to its own peak has a standard deviation of about a
	 * quarter of it -- so raw readings cluster in the middle of the square and
	 * the corners name climates no ground is in. The fit measures the land's
	 * own 2nd and 98th percentiles and stretches the square onto them.
	 *
	 * Read only when {@link climateFit} is absent, which is what names a
	 * span rather than measuring one.
	 */
	readonly fit?: boolean;

	/**
	 * The spans to read every climate through, in place of measuring this
	 * planet's own.
	 *
	 * **A span that is a constant maps one reading to one dot on every
	 * world**, which is what a table naming a real classification promises
	 * and a per-planet measurement cannot keep. {@link FIXED_FIT} is the one
	 * measured for the shipped climate model; a table whose dots were placed
	 * against this planet's own land leaves this absent and sets
	 * {@link fit} instead.
	 */
	readonly climateFit?: ClimateFit | null;

	/**
	 * Whether biomes belong to regions.
	 *
	 * A region reads one climate across a whole area, so a thin ribbon of one
	 * biome inside another -- the contour a per-cell read draws wherever the
	 * climate grazes past two nearby dots -- cannot form inside one, and the
	 * planet map comes out as blocks with clean edges. What it costs is
	 * crossing rate: region edges arrive on top of landform edges.
	 */
	readonly regions?: boolean;

	/** Metres across one region, on average. */
	readonly regionSpan?: number;

	/** How far a cell's climate is pulled toward its region's, `0` to `1`. */
	readonly regionClimate?: number;

	/** Metres the region lookup is bent, so an edge is not a straight line. */
	readonly regionWarp?: number;

	/** Metres above the sea under which land can be shore. */
	readonly shoreHeight?: number;

	/**
	 * Metres to the six points the shore rule asks for room.
	 *
	 * **The step is a distance, never a neighbouring cell.** A rule reading
	 * the cells next door answers a different question at every level of
	 * detail, so a coarse chunk and a fine one would disagree about where the
	 * beach is. Six points at a fixed radius ask the same question at every
	 * level, and the radius is bounded, so a chunk answers from its own
	 * address with no flood fill.
	 */
	readonly shoreReach?: number;

	/**
	 * Octaves the landform reads the relief at.
	 *
	 * The terrain's own relief stack runs to a narrow octave because its job
	 * is to carve one gully; asking it what kind of place this is at that size
	 * asks a per-gully question and gets a per-gully answer. One octave reads
	 * the same field at the width of a place.
	 */
	readonly formDetail?: number;
}

export const BIOME_DEFAULTS = {
	tempEquator: 0.7,
	tempLapse: 0.9,
	tempNoise: 0.35,
	tempFeature: 3000,
	tempOctaves: 3,
	humOcean: 0.6,
	humNoise: 0.5,
	humFeature: 2200,
	humOctaves: 3,
	humLapse: 0,
	humBelt: 0.4,
	humBeltAt: 0.25,
	humBeltWidth: 0.24,
	warp: true,
	warpStrength: 0.12,
	warpFeature: 700,
	warpOctaves: 3,
	fit: true,
	climateFit: null,
	regions: true,
	regionSpan: 1600,
	regionClimate: 1,
	regionWarp: 400,
	shoreHeight: 12,
	shoreReach: 32,
	formDetail: 1,
} as const satisfies Required<BiomeSettings>;
