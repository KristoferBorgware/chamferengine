import type {
	CellFeature,
	CoarseMapOptions,
	NoiseBasis,
	TerrainOptions,
} from "chamfer/generation";
import { CoarseMap, GROUND_LINES, seedFromString } from "chamfer/generation";
import { CELL_CONSTANT, WorldShape, maxCrustDepth } from "chamfer/world";
import { LAYER_COUNT, wordBits } from "chamfer/addressing";
import { PLAYER_DEFAULTS } from "chamfer/player";

/**
 * The level a flat coarse map is built at when the coarse map is off.
 *
 * Every field of a flat map is zero everywhere, so no level reads any
 * differently from any other -- this is the cheapest one, not a rounded
 * request in metres the way {@link PlanetSettings.coarseLevel} is.
 */
export const FLAT_COARSE_LEVEL = 2;

/**
 * The deepest world the address word can name.
 *
 * The word is `[planet 12][face 5][path 2 x depth][corner 2][layer 10]`, so it
 * is `29 + 2 x depth` bits wide and 64 of them run out at depth 17.
 */
const MAX_DEPTH = 17;

/**
 * Metres across the smallest landform the coarse map carries.
 *
 * The relief tier is summed octaves, each half the width of the one above it,
 * and this is where that stops. It is a fixed number of metres rather than a
 * multiple of the coarse cell: tying it to the cell would give a 16 m map one
 * more octave than a 32 m map, so the same seed would grow different hills at
 * different resolutions, and the resolution is supposed to decide only how
 * finely a river is drawn.
 *
 * A map has to be fine enough to carry it, which is two samples across a
 * feature. That is what refuses a coarse cell wider than half of this.
 */
const SMALLEST_LANDFORM = 64;

/**
 * The finest level the coarse map may be built at.
 *
 * Radius and Coarse cell are asked for independently, and neither refusal in
 * {@link PlanetSettings.problems} catches the two of them combined: a 25,000 m
 * radius with a 4 m coarse cell asks for level 13, 671,088,642 cells, with
 * nothing on the panel to say those two numbers do not go together (F-020).
 * Level 9 -- 2,621,442 cells, 10 MB a field -- is the largest coarse map this
 * project has actually built and timed, at 13.8 s, when I-5 measured it
 * against the 32 m default. This is that number, not a guess: raising it
 * needs a new measurement.
 */
const MAX_COARSE_LEVEL = 9;

/**
 * What a person sets, before anything is derived from it.
 *
 * Every one of these is in metres or in cells — something a person can picture.
 * Subdivision depth, chunk level and coarse level are not here: those follow
 * from a size and a radius, and putting them in would have the dependency
 * backwards.
 */
export interface PlanetKnobs {
	seed: string;

	/**
	 * Whether the world is held down to its lattice and nothing else.
	 *
	 * On, nine things are paused at once: the coarse map, the detail noise,
	 * water, the atmosphere, the day, the clouds, the moon, the stars, and the
	 * light moving at all. What is left is a smooth green sphere of cells, lit
	 * as at noon, which is the only state in which the level of detail can be
	 * looked at on its own -- every paused feature changes the color on both
	 * sides of a chunk boundary for a reason of its own.
	 *
	 * Nothing is removed by it. Every paused subsystem keeps its code, its
	 * tests and its knobs, and unchecking this gives all of them back.
	 */
	plain: boolean;

	/**
	 * How many times a face is split, which is what decides how big the planet
	 * is once a block size is chosen.
	 *
	 * Depth, block size and radius are one quantity written three ways --
	 * `radius = blockSize x 2^depth / K` -- so any two of them fix the third.
	 * This is the pair a person can actually set: a block size is a size you
	 * can picture, and a depth is a whole number with a distinct world behind
	 * every value. Asking for a radius instead gave a slider of 484 positions
	 * reaching **6** distinct worlds, because a radius is quantised to powers
	 * of two and every position between two of them built the same planet.
	 */
	subdivisionDepth: number;

	/** Metres across one cell. */
	blockSize: number;

	/** Cells along one edge of a chunk. */
	chunkCells: number;

	/**
	 * Whether the height map runs at all. Off is a smooth sphere at sea level,
	 * which is the only state the level of detail can be judged in.
	 */
	coarseMap: boolean;

	/** Which noise function one octave is. */
	noiseBasis: NoiseBasis;

	/** Metres across one cell of the height map, which is one step of ground. */
	coarseSpacing: number;

	/** Metres across the widest feature the noise makes. */
	noiseScale: number;

	/** How many octaves of noise are summed. */
	octaves: number;

	/** What each octave's amplitude is multiplied by. */
	persistence: number;

	/** What each octave's frequency is multiplied by. */
	lacunarity: number;

	/** Slides the sample point through the noise field. */
	offsetX: number;
	offsetY: number;

	/** How far a second field pushes the sample point. Zero reads it where it stands. */
	warpAmplitude: number;

	/** Metres across the widest feature of the field doing the pushing. */
	warpScale: number;

	/** The angle every gradient is turned by, in radians. `psrd` only. */
	spin: number;

	/** How far a feature point may sit from its cell's middle. `cellular` only. */
	jitter: number;

	/** Which cellular distance is reported. `cellular` only. */
	cellFeature: CellFeature;

	/** Metres from sea level to the tallest ground. */
	relief: number;

	/** Metres from sea level down to the deepest sea floor. */
	seaDepth: number;

	/** How much each octave is folded at its own zero crossing, for creases. */
	ridge: number;

	/**
	 * How hard the water cuts into the ground.
	 *
	 * Off, and off the panel, until F-039 is fixed: what the droplets cut is a
	 * lattice pattern rather than valleys. Still reachable as `?erosion=0.5`
	 * for whoever comes back to it.
	 */
	erosion: number;

	/** How much of the surface stands above the sea. */
	landFraction: number;

	/** Metres from the top of the tallest ground to the floor of the world. */
	crustMetres: number;

	/** Metres to the top of the air. */
	atmosphereTop: number;

	/** How thick the air reads straight up. */
	zenithDepth: number;

	/** Whether the cloud decks are drawn at all. */
	cloudsDrawn: boolean;

	/** Metres to each cloud deck. */
	lowDeck: number;
	highDeck: number;

	/** Metres across one cloud puff. */
	cloudPuff: number;

	/** How many cloud formations stand over the whole planet. */
	cloudClusters: number;

	/** How many puffs one formation is built out of at its thickest. */
	cloudDensity: number;

	/** Metres across one formation. */
	cloudSpread: number;

	/** How many times its own width a chunk is away before it drops a level. */
	detail: number;

	/**
	 * Whether a chunk outside the view is selected and built at all.
	 *
	 * Off, the whole ring around the player is built and about a third of it
	 * is drawn. On, the selection prunes to the view before it asks for
	 * anything, and {@link PlanetKnobs.cullMargin} is how much beyond the edge
	 * of the screen it keeps so turning has something to turn onto.
	 *
	 * **The picture does not change.** Measured at eye level on a settled
	 * world, the same **104** chunks are drawn whether it is off, on at 25
	 * degrees, or on at 0 -- what moves is how much is held to draw them:
	 * 346 chunks resident off, 170 at 25 degrees, 107 at 0, and 232 selected
	 * down to 115 and 77. That is the whole point of it: a third of what was
	 * resident was on screen, and at no margin at all 97% of it is.
	 */
	buildCull: boolean;

	/**
	 * Degrees past the edge of the view a chunk is still built for.
	 *
	 * What a turn turns onto. At 0 the world holds almost exactly what is on
	 * screen and a turn arrives on ground that has to be built; the wider it
	 * goes the more is waiting, and past about 45 degrees on a 65-degree view
	 * nothing is refused at all and it costs what leaving it off costs.
	 */
	cullMargin: number;

	/**
	 * Whether a freed worker takes the nearest waiting chunk or the oldest.
	 *
	 * The queue outlives a selection, so the oldest is not the nearest: a
	 * chunk asked for on the horizon is still waiting when the player has
	 * walked up to it.
	 */
	nearestFirst: boolean;

	/** Whether a chunk draws the ring of cells just beyond its rim. */
	apron: boolean;

	/** Whether the terrain paints its seams: face edges, chunk rims, aprons. */
	seamOverlay: boolean;

	/**
	 * Whether the world is drawn as its own grid.
	 *
	 * On, every chunk is selected and levelled exactly as the terrain would
	 * be, then built as a flat shell of hexagons at the world's highest point
	 * instead of ground. The four switches below choose which structures the
	 * shell shows.
	 */
	gridMode: boolean;

	/** Whether each chunk of the grid is tinted by its level of detail. */
	gridLevels: boolean;

	/** Whether each grid cell keeps its own speckle, so the tiling reads. */
	gridCells: boolean;

	/** Whether grid cells on a chunk boundary are marked. */
	gridChunks: boolean;

	/** Whether grid cells on a face edge are marked. */
	gridFaces: boolean;

	/**
	 * Whether the camera that decides what to draw is held where it is.
	 *
	 * On, the level of detail and the frustum cull go on reading the place and
	 * the direction the camera had at the moment it was turned on, while the
	 * camera itself keeps moving. Flying out of that frozen view is then the
	 * only way to see where its edges fell.
	 */
	freezeView: boolean;

	/** Seconds in a day. */
	dayLength: number;

	/** Whether the day and night cycle advances. */
	paused: boolean;

	/** The fraction of a day to show while paused, 0 at midnight to 1 at the next. */
	timeOfDay: number;

	/** How fast the player walks, in metres a second. */
	walkSpeed: number;
}

export const PLANET_DEFAULTS: PlanetKnobs = {
	seed: "chamfer",
	plain: false,
	subdivisionDepth: 13,
	blockSize: 1,
	chunkCells: 64,
	coarseMap: true,
	noiseBasis: "perlin",
	coarseSpacing: 32,
	noiseScale: 29400,
	octaves: 5,
	persistence: 0.5,
	lacunarity: 3.4,
	offsetX: 15,
	offsetY: 9,
	warpAmplitude: 0.8,
	warpScale: 8400,
	spin: 0,
	jitter: 0.55,
	cellFeature: "f1",
	relief: 1100,
	seaDepth: 130,
	ridge: 0.85,
	erosion: 0,
	landFraction: 0.65,
	crustMetres: 1232,
	atmosphereTop: 2050,
	zenithDepth: 0.272,
	cloudsDrawn: true,
	lowDeck: 3000,
	highDeck: 6000,
	cloudPuff: 64,
	cloudClusters: 1200,
	cloudDensity: 100,
	cloudSpread: 180,
	detail: 5,
	buildCull: true,
	cullMargin: 25,
	nearestFirst: true,
	apron: true,
	seamOverlay: false,
	gridMode: false,
	gridLevels: true,
	gridCells: true,
	gridChunks: true,
	gridFaces: false,
	freezeView: false,
	dayLength: 3600,
	paused: true,
	timeOfDay: 0.18,
	walkSpeed: PLAYER_DEFAULTS.walkSpeed,
};

/**
 * A knob that is a number, and what it may be set to.
 *
 * A boolean knob reuses this with `low: 0, high: 1, step: 1` -- the panel
 * tells the two kinds apart by the draft value's own `typeof`, not by a field
 * here, so a boolean knob's range is unused and kept only so every knob has
 * one entry in one table.
 */
export interface KnobRange {
	readonly low: number;
	readonly high: number;
	readonly step: number;

	/** Whether changing it means building the world again. */
	readonly rebuilds: boolean;

	readonly unit: string;
}

const TOGGLE: Pick<KnobRange, "low" | "high" | "step" | "unit"> = {
	low: 0,
	high: 1,
	step: 1,
	unit: "",
};

export const KNOB_RANGES: Record<string, KnobRange> = {
	plain: { ...TOGGLE, rebuilds: true },
	subdivisionDepth: { low: 4, high: 17, step: 1, rebuilds: true, unit: "" },
	blockSize: { low: 0.5, high: 4, step: 0.25, rebuilds: true, unit: "m" },
	chunkCells: { low: 8, high: 64, step: 8, rebuilds: true, unit: "cells" },
	coarseMap: { ...TOGGLE, rebuilds: true },
	noiseBasis: { low: 0, high: 0, step: 1, rebuilds: true, unit: "" },
	cellFeature: { low: 0, high: 0, step: 1, rebuilds: true, unit: "" },
	coarseSpacing: { low: 4, high: 128, step: 4, rebuilds: true, unit: "m" },
	noiseScale: {
		low: 200,
		high: 40000,
		step: 100,
		rebuilds: true,
		unit: "m",
	},
	octaves: { low: 1, high: 8, step: 1, rebuilds: true, unit: "" },
	persistence: {
		low: 0.05,
		high: 0.95,
		step: 0.05,
		rebuilds: true,
		unit: "",
	},
	lacunarity: { low: 1.2, high: 4, step: 0.05, rebuilds: true, unit: "" },
	offsetX: { low: -500, high: 500, step: 1, rebuilds: true, unit: "" },
	offsetY: { low: -500, high: 500, step: 1, rebuilds: true, unit: "" },
	warpAmplitude: {
		low: 0,
		high: 1.5,
		step: 0.05,
		rebuilds: true,
		unit: "",
	},
	warpScale: {
		low: 200,
		high: 40000,
		step: 100,
		rebuilds: true,
		unit: "m",
	},
	spin: { low: 0, high: 6.28, step: 0.02, rebuilds: true, unit: "rad" },
	jitter: { low: 0, high: 1, step: 0.05, rebuilds: true, unit: "" },
	relief: { low: 20, high: 2400, step: 20, rebuilds: true, unit: "m" },
	seaDepth: { low: 10, high: 1200, step: 10, rebuilds: true, unit: "m" },
	ridge: { low: 0, high: 1, step: 0.05, rebuilds: true, unit: "" },
	erosion: { low: 0, high: 1, step: 0.05, rebuilds: true, unit: "" },
	landFraction: {
		low: 0.05,
		high: 0.8,
		step: 0.05,
		rebuilds: true,
		unit: "",
	},
	// A crust is a count of layers and a layer is a block tall, so the metres
	// it reaches are the layer field's 2,048 times whatever a block is: 2,048 m
	// at a 1 m block and 8,192 m at a 4 m one, which is the largest any world
	// here reaches. Stating this in metres and holding it at the layer count
	// held every world with a block over a metre to a fraction of the depth it
	// could carry, because `rangeFor` only ever narrows.
	crustMetres: { low: 32, high: 8192, step: 16, rebuilds: true, unit: "m" },
	atmosphereTop: {
		low: 50,
		high: 4000,
		step: 25,
		rebuilds: false,
		unit: "m",
	},
	zenithDepth: {
		low: 0.02,
		high: 0.8,
		step: 0.002,
		rebuilds: false,
		unit: "",
	},
	cloudsDrawn: { ...TOGGLE, rebuilds: false },
	lowDeck: { low: 100, high: 20000, step: 20, rebuilds: false, unit: "m" },
	highDeck: { low: 200, high: 40000, step: 50, rebuilds: false, unit: "m" },
	cloudPuff: { low: 8, high: 600, step: 4, rebuilds: false, unit: "m" },
	cloudClusters: {
		low: 100,
		high: 4000,
		step: 100,
		rebuilds: false,
		unit: "",
	},
	cloudDensity: {
		low: 4,
		high: 400,
		step: 2,
		rebuilds: false,
		unit: "puffs",
	},
	cloudSpread: { low: 40, high: 4000, step: 20, rebuilds: false, unit: "m" },
	detail: { low: 1, high: 5, step: 0.5, rebuilds: false, unit: "widths" },
	buildCull: { ...TOGGLE, rebuilds: false },
	cullMargin: { low: 0, high: 90, step: 5, rebuilds: false, unit: "deg" },
	nearestFirst: { ...TOGGLE, rebuilds: false },
	apron: { ...TOGGLE, rebuilds: true },
	seamOverlay: { ...TOGGLE, rebuilds: true },
	gridMode: { ...TOGGLE, rebuilds: true },
	gridLevels: { ...TOGGLE, rebuilds: true },
	gridCells: { ...TOGGLE, rebuilds: true },
	gridChunks: { ...TOGGLE, rebuilds: true },
	gridFaces: { ...TOGGLE, rebuilds: true },
	freezeView: { ...TOGGLE, rebuilds: false },
	dayLength: { low: 30, high: 3600, step: 10, rebuilds: false, unit: "s" },
	paused: { ...TOGGLE, rebuilds: false },
	timeOfDay: { low: 0, high: 1, step: 0.01, rebuilds: false, unit: "" },
	walkSpeed: { low: 0.5, high: 20, step: 0.5, rebuilds: false, unit: "m/s" },
};

/**
 * Knobs that never travel in a query string, in either direction.
 *
 * Freeze view holds the camera the frame was drawn with, and that camera
 * cannot be written into a link -- what a fresh page would freeze is its own
 * spawn camera, 1.6 km over the shipped planet, which nobody chose. Every
 * rebuild knob reloads the page through these params, so before this set
 * existed, changing Chunk while frozen relatched the freeze at the spawn
 * camera and the world came back stuck at face-level cells.
 */
export const TRANSIENT: ReadonlySet<keyof PlanetKnobs> = new Set([
	"freezeView",
] as (keyof PlanetKnobs)[]);

/** The nearest power of two, for turning a size in metres into a level. */
function levelFor(span: number, size: number): number {
	return Math.max(0, Math.round(Math.log2(span / size)));
}

/**
 * One world, as the numbers a person sets and the numbers that follow.
 *
 * A subdivision depth is a property of the grid, not of a world. Someone
 * choosing a planet picks a size for a block and a size for the planet; the
 * depth follows, and **the radius moves to whatever makes the block exact**,
 * which is doc 06's rule and this project's seventh invariant. The same holds
 * for the chunk level and for the level the coarse map is built at: both are
 * asked for in metres and answered in levels.
 *
 * Nothing here builds anything. It is the arithmetic between what is typed and
 * what the engine takes, and the list of reasons a world cannot be built.
 */
export class PlanetSettings {
	readonly knobs: PlanetKnobs;

	constructor(knobs: Partial<PlanetKnobs> = {}) {
		this.knobs = { ...PLANET_DEFAULTS, ...knobs };
	}

	/** The seed as the generator takes it, hashed from what was typed. */
	get seedNumber(): number {
		return seedFromString(this.knobs.seed);
	}

	/**
	 * Whether continents, rivers and the sea run, once the pause is applied.
	 *
	 * `plain` overrides the knob rather than replacing it, so the setting a
	 * person left behind is still there when they uncheck the pause. Every
	 * reader inside this class goes through here rather than through
	 * `knobs.coarseMap`, which is what keeps the override in one place.
	 */
	get coarseMapRuns(): boolean {
		return this.knobs.coarseMap && !this.knobs.plain;
	}

	/**
	 * Metres from sea level to the tallest ground, once the pause is applied.
	 *
	 * Zero under the pause, and zero is exact rather than small: the whole
	 * field is multiplied by it, so the ground is a sphere to the last bit.
	 */
	get relief(): number {
		return this.coarseMapRuns ? this.knobs.relief : 0;
	}

	/** Metres to the deepest sea floor, once the pause is applied. */
	get seaDepth(): number {
		return this.coarseMapRuns ? this.knobs.seaDepth : 0;
	}

	/** The depth the radius and the block size ask for, before any cap. */
	/** How many times a face is split. Asked for directly. */
	get depth(): number {
		return Math.min(MAX_DEPTH, Math.max(1, this.knobs.subdivisionDepth));
	}

	/**
	 * The radius the world has, which follows exactly from the other two.
	 *
	 * Block size is fixed at world creation, and a depth is a whole number, so
	 * there is no rounding left for the radius to absorb: this is the size the
	 * planet is rather than the size it was moved to.
	 */
	get radius(): number {
		return (this.knobs.blockSize * 2 ** this.depth) / CELL_CONSTANT;
	}

	get chunkLevel(): number {
		const cells = Math.max(1, Math.round(Math.log2(this.knobs.chunkCells)));
		return Math.max(0, this.depth - cells);
	}

	get coarseLevel(): number {
		return Math.max(
			2,
			Math.min(
				this.depth,
				MAX_COARSE_LEVEL,
				levelFor(CELL_CONSTANT * this.radius, this.knobs.coarseSpacing),
			),
		);
	}

	/**
	 * Whether the coarse map is coarser than asked because it had to be.
	 *
	 * A wide radius and a fine cell together ask for a level nobody has built:
	 * 19,800 m and 12 m ask for level 11, which is 41,943,042 cells and four
	 * fields of them. The panel shows what was given instead of leaving the
	 * slider looking like it did nothing.
	 */
	get coarseLevelCapped(): boolean {
		return (
			Math.min(this.depth, MAX_COARSE_LEVEL) <
			levelFor(CELL_CONSTANT * this.radius, this.knobs.coarseSpacing)
		);
	}

	/**
	 * How many layers deep the world runs, under all three caps.
	 *
	 * The taper says where a column would pinch shut, the layer field says how
	 * many layers can be named, and the knob says how many are wanted. This is
	 * the only place the layer field is filled from, so no setting here can put
	 * a layer outside it.
	 */
	get crustDepth(): number {
		const wanted = Math.ceil(this.knobs.crustMetres / this.knobs.blockSize);
		return Math.max(
			8,
			Math.min(wanted, maxCrustDepth(this.depth), LAYER_COUNT),
		);
	}

	/**
	 * Which of the three caps on {@link PlanetSettings.crustDepth} bound it.
	 *
	 * `"asked"` means the knob got what it wanted. `"taper"` means the column
	 * would pinch shut before reaching that far down, and `"field"` means the
	 * ten-bit layer field ran out of names at 1,024 layers.
	 */
	get crustCap(): "asked" | "taper" | "field" {
		const wanted = Math.ceil(this.knobs.crustMetres / this.knobs.blockSize);
		if (wanted <= this.crustDepth) return "asked";
		return maxCrustDepth(this.depth) <= LAYER_COUNT ? "taper" : "field";
	}

	/**
	 * A pre-build guess at how far the ground reaches above sea level.
	 *
	 * **It is the Relief knob, exactly.** The map is scaled so its tallest
	 * point stands that many metres up, so there is nothing to estimate: the
	 * guess and the answer are the same number, and the long paragraph that
	 * used to be here explaining how far off the guess could be is gone with
	 * the multiplier it described.
	 *
	 * Erosion only lowers ground, so this stays an upper bound after it runs.
	 */
	get maxElevation(): number {
		return Math.max(1, Math.ceil(this.relief));
	}

	/** The metres of ground above sea level the built map actually reaches. */
	tallestGroundOf(map: CoarseMap): number {
		let highest = 0;
		for (let cell = 0; cell < map.count; cell++)
			if (map.height[cell]! > highest) highest = map.height[cell]!;
		return Math.max(1, Math.ceil(highest));
	}

	/**
	 * How far the ground spreads, floor to peak, before anyone digs.
	 *
	 * The peak is exactly Relief and the floor is exactly Sea depth, because
	 * the two are scaled apart. It used to be Relief times a curve through
	 * Land — sea level is a percentile above the noise's own middle, so asking
	 * for less land left the floor further under it and the ocean took `1.92x`
	 * what the mountains got. That was what capped Relief at `320 m`.
	 *
	 * **A sea floor through the bottom of the world is a flat abyss**, not a
	 * crash: the crust clamps it. It is still worth refusing, because a world
	 * whose ocean floor is one plateau is not the world the map drew.
	 */
	get groundSpan(): number {
		return Math.max(2, this.relief + this.seaDepth);
	}

	/** Metres across one cell of the coarse map, once its level is rounded. */
	get coarseCell(): number {
		return (CELL_CONSTANT * this.radius) / 2 ** this.coarseLevel;
	}

	/**
	 * Metres across the narrowest feature the octave stack makes.
	 *
	 * Each octave is `lacunarity` times narrower than the one above it, so the
	 * last one is the widest feature divided by `lacunarity` to the power of
	 * one less than the octave count. **This is the number the map has to be
	 * fine enough to draw**, and the panel refuses a map that is not: ground
	 * the map cannot carry is ground the world does not have, because the world
	 * is the map.
	 */
	get smallestLandform(): number {
		return (
			this.knobs.noiseScale /
			this.knobs.lacunarity ** (this.knobs.octaves - 1)
		);
	}

	/**
	 * A size in metres, as the engine's noise wants it.
	 *
	 * Noise is sampled from a unit direction, so a frequency counts features
	 * across the whole sphere. One feature is then `radius / frequency` metres,
	 * and a planet four times larger grows four times larger hills from the same
	 * number. Every frequency the engine takes is derived here from a size, so
	 * changing the radius moves the horizon and leaves the landforms alone.
	 */
	private frequencyFor(metres: number): number {
		return this.radius / metres;
	}

	/** Metres across one chunk. */
	get chunkSpan(): number {
		return this.knobs.blockSize * 2 ** (this.depth - this.chunkLevel);
	}

	/**
	 * How wide one cell address is, in bits.
	 *
	 * Two knobs reach it and no others. The radius and the block size set the
	 * subdivision depth, which is two bits of path per level, and the crust sets
	 * how many of the ten layer bits are used. Everything else here decides what
	 * block sits at an address rather than what the address is.
	 */
	get addressBits(): number {
		return wordBits(this.depth);
	}

	/**
	 * The world shape, using the pre-build guess at how tall the ground is.
	 *
	 * Only for asking questions before a coarse map exists to answer them
	 * exactly: the panel's derived readout, and the pre-build refusals in
	 * {@link problems}. **Never build a world from this** — call
	 * {@link shapeFor} once the coarse map is built, or a Land setting far from
	 * 0.3 builds a crust top too low for its own ground and the peaks come out
	 * flat.
	 */
	shape(): WorldShape {
		return new WorldShape(
			this.radius,
			this.depth,
			this.maxElevation,
			this.crustDepth,
		);
	}

	/**
	 * The world shape once its coarse map exists, with the crust top placed at
	 * the map's own true peak rather than a guess.
	 *
	 * A knob that reaches no further than this class is a slider that moves and
	 * changes nothing, which is worse than no slider, so every knob a subsystem
	 * has an option for is passed here rather than left at its default.
	 */
	shapeFor(map: CoarseMap): WorldShape {
		return new WorldShape(
			this.radius,
			this.depth,
			this.tallestGroundOf(map),
			this.crustDepth,
		);
	}

	coarseOptions(): CoarseMapOptions {
		return {
			basis: this.knobs.noiseBasis,
			level: this.coarseLevel,
			cellMetres: this.coarseCell,
			frequency: this.frequencyFor(this.knobs.noiseScale),
			octaves: this.knobs.octaves,
			persistence: this.knobs.persistence,
			lacunarity: this.knobs.lacunarity,
			offsetX: this.knobs.offsetX,
			offsetY: this.knobs.offsetY,
			warpAmplitude: this.knobs.warpAmplitude,
			warpFrequency: this.frequencyFor(this.knobs.warpScale),
			spin: this.knobs.spin,
			jitter: this.knobs.jitter,
			feature: this.knobs.cellFeature,
			relief: this.relief,
			seaDepth: this.seaDepth,
			ridge: this.knobs.ridge,
			landFraction: this.knobs.landFraction,
			erosion: this.knobs.erosion,
		};
	}

	terrainOptions(): TerrainOptions {
		// The two are absolute metres, the same metres the Ground map's bands
		// are drawn on, so a colour on the map is the block the world builds.
		return { rockLine: GROUND_LINES.rock, snowLine: GROUND_LINES.snow };
	}

	/**
	 * One knob's range, narrowed by the rest of the draft.
	 *
	 * **A slider that cannot be moved into a refusal is worth more than a
	 * refusal that explains itself.** Several of these knobs bound each other —
	 * the crust has to reach past the ground, the map has to be fine enough to
	 * draw the narrowest octave, a chunk has to be smaller than a face — and
	 * every one of those pairs used to be discovered by hitting it. The panel
	 * moves the slider's own end instead, so the wall is visible before it is
	 * reached and {@link problems} is left as a backstop for a hand-edited
	 * query string.
	 *
	 * The narrowing only ever moves an end **inward**. Nothing here widens a
	 * range past what {@link KNOB_RANGES} states.
	 */
	rangeFor(key: keyof PlanetKnobs): KnobRange {
		const range = KNOB_RANGES[key as string]!;
		const k = this.knobs;
		// Both round to the slider's own step and stay inside its stated ends,
		// so a narrowing can never widen one.
		const inside = (v: number): number =>
			Math.min(range.high, Math.max(range.low, v));
		const up = (v: number): number =>
			inside(Math.ceil(v / range.step) * range.step);
		const down = (v: number): number =>
			inside(Math.floor(v / range.step) * range.step);
		const narrowed = (ends: Partial<KnobRange>): KnobRange => {
			const out = { ...range, ...ends };
			// A pair of constraints can cross. The lower end wins, because it
			// is the one describing a world that can be built.
			return { ...out, high: Math.max(out.low, out.high) };
		};

		switch (key) {
			// The address is 2 bits of path per level and the word is 64, which
			// is what stops the subdivision at MAX_DEPTH. A chunk has to fit
			// inside a face with a level left over for the detail to walk down.
			// Two things stop a world being too small. A chunk has to fit
			// inside a face with a level left over for the detail to walk
			// down. And the crust tapers with the world, so a small enough
			// planet cannot hold even the shallowest ground the panel offers
			// -- 53 m across, the crust reaches 13 m, and the least relief and
			// sea depth here come to 30.
			case "subdivisionDepth": {
				const leastGround =
					KNOB_RANGES.relief!.low + KNOB_RANGES.seaDepth!.low;
				let least = range.low;
				while (
					least < range.high &&
					Math.min(maxCrustDepth(least), LAYER_COUNT) * k.blockSize <
						leastGround
				)
					least++;
				return narrowed({
					low: Math.max(
						least,
						1 + Math.round(Math.log2(k.chunkCells)),
					),
					high: MAX_DEPTH,
				});
			}

			// A map cell has to be coarser than a block or the map is being
			// asked to describe the ground one block at a time. Three blocks
			// rather than two, because the level is rounded and a request can
			// land a factor of root two under what it asked for.
			case "coarseSpacing":
				return narrowed({ low: up(3 * k.blockSize) });

			// The world is the map, so an octave narrower than two map cells is
			// ground that would not exist.
			case "octaves":
				return narrowed({
					high: Math.max(
						range.low,
						Math.min(
							range.high,
							1 +
								Math.floor(
									Math.log(
										k.noiseScale / (2 * this.coarseCell),
									) / Math.log(k.lacunarity),
								),
						),
					),
				});
			case "noiseScale":
				return narrowed({ low: up(2 * this.coarseCell) });

			// The crust runs from above the tallest ground to under the deepest
			// sea, and it can hold at most the layer field's 1,024 layers.
			case "relief":
				return narrowed({ high: down(this.reliefCeiling) });
			case "seaDepth":
				return narrowed({
					high: down(this.crustCeiling - this.relief),
				});
			case "crustMetres":
				return narrowed({
					low: up(this.groundSpan),
					high: down(this.crustCeiling),
				});

			// A chunk the size of a whole face leaves nothing for the level of
			// detail to walk down.
			case "chunkCells":
				return narrowed({ high: down(2 ** (this.depth - 1)) });

			case "lowDeck":
				return narrowed({ high: down(k.highDeck - range.step) });
			case "highDeck":
				return narrowed({ low: up(k.lowDeck + range.step) });
		}
		return range;
	}

	/** The deepest crust this block size and the layer field allow, in metres. */
	get crustCeiling(): number {
		return (
			Math.min(maxCrustDepth(this.depth), LAYER_COUNT) *
			this.knobs.blockSize
		);
	}

	/**
	 * The tallest ground a crust of {@link crustCeiling} can hold.
	 *
	 * The span is Relief plus Sea depth, so this is the deepest crust the layer
	 * field allows with the ocean's share taken out of it.
	 */
	get reliefCeiling(): number {
		return this.crustCeiling - this.seaDepth;
	}

	/**
	 * Every knob pulled inside the range the rest of the draft leaves it.
	 *
	 * Applied in dependency order, because these bound each other: the block
	 * size and the radius decide the depth, the depth and the map cell decide
	 * how many octaves fit, and Relief decides how deep the crust has to run.
	 * Working down that order settles in one pass.
	 *
	 * **It only ever pushes a value into range, never back out.** Lowering
	 * Relief widens what the crust may be and leaves the crust where it was, so
	 * nothing a person set is undone by a knob they went on to turn back.
	 */
	static settle(knobs: PlanetKnobs): PlanetKnobs {
		const order: (keyof PlanetKnobs)[] = [
			"blockSize",
			"subdivisionDepth",
			"chunkCells",
			"coarseSpacing",
			"noiseScale",
			"octaves",
			"relief",
			"seaDepth",
			"crustMetres",
			"lowDeck",
			"highDeck",
		];
		const out = { ...knobs };
		const values = out as unknown as Record<string, number>;
		for (const key of order) {
			const range = new PlanetSettings(out).rangeFor(key);
			const was = values[key as string]!;
			values[key as string] = Math.min(
				range.high,
				Math.max(range.low, was),
			);
		}
		return out;
	}

	/**
	 * Why this world cannot be built, or nothing if it can.
	 *
	 * A person setting numbers by hand will reach one of these, and a message
	 * is better than a planet that draws wrongly and leaves them guessing which
	 * knob did it.
	 */
	problems(): string[] {
		const out: string[] = [];
		const k = this.knobs;

		// The crust has to reach from the top of the tallest ground to under
		// the deepest sea, or the sea floor falls out of the bottom of the
		// world and every ocean column is empty.
		const reach = this.crustDepth * k.blockSize;
		if (reach < this.groundSpan) {
			const neededCrust = Math.ceil(this.groundSpan);
			out.push(
				`The crust reaches ${Math.round(reach)} m and the ground spans about ${Math.round(this.groundSpan)} m, so the deepest ocean has no floor: those columns are water down to the last layer and nothing under it. Raise Crust reaches to at least ${neededCrust} m, or lower Relief to ${Math.max(0, Math.floor(reach - this.seaDepth))} m or under.`,
			);
		}

		// The coarse map's own resolution only matters while it runs. Off, its
		// level is a fixed cheap constant nothing reads, so these two checks
		// would be warning about a knob with nothing left to affect.
		if (this.coarseMapRuns) {
			if (this.coarseCell < k.blockSize * 2) {
				const neededSpacing = Math.ceil(k.blockSize * 2);
				out.push(
					`A ${Math.round(this.coarseCell)} m map cell is no coarser than a ${k.blockSize} m block, so the map is asking to describe the ground one block at a time. Raise Map cell to at least ${neededSpacing} m.`,
				);
			}

			// Two samples across a feature is the least that describes it. Below
			// that the map records something narrower than it can see, and what
			// it records changes with the resolution rather than with the seed.
			// The world is the map, so a feature the map cannot draw is a
			// feature the ground does not have. Two samples across it is the
			// least that describes it.
			if (this.coarseCell * 2 > this.smallestLandform) {
				const largestOctaves =
					1 +
					Math.floor(
						Math.log(k.noiseScale / (2 * this.coarseCell)) /
							Math.log(k.lacunarity),
					);
				out.push(
					`The narrowest octave is ${Math.round(this.smallestLandform)} m across and a map cell is ${Math.round(this.coarseCell)} m, so the map cannot draw the finest ground it is being asked for — and the world is the map, so that ground would not exist. Lower Octaves to ${Math.max(1, largestOctaves)}, raise Noise scale, or lower Map cell.`,
				);
			}
		}

		if (this.chunkLevel <= 0) {
			const largestChunkCells = 2 ** Math.max(0, this.depth - 1);
			out.push(
				`A ${k.chunkCells}-cell chunk at depth ${this.depth} is the whole face, which leaves nothing for the level of detail to walk down. Lower Chunk to ${largestChunkCells} cells or under.`,
			);
		}

		if (k.highDeck <= k.lowDeck)
			out.push(
				`The high cloud deck sits at ${k.highDeck} m and the low one at ${k.lowDeck} m, so they are inside out. Raise High deck above ${k.lowDeck} m, or lower Low deck under ${k.highDeck} m.`,
			);

		return out;
	}

	/**
	 * Read a world out of a query string, falling back on the defaults.
	 *
	 * **What comes back is settled.** The panel moves each slider's own ends
	 * with the rest of the draft, so a combination that cannot be built cannot
	 * be dragged to — and a link went straight past that, because **Copy link**
	 * is how a world travels and a hand-edited one is how it gets changed. A
	 * query string naming a crust too shallow for its own sea built a planet
	 * whose ocean columns were entirely under the bottom of the world: no
	 * blocks, nothing drawn, space where the water should be. Settling moves
	 * each value to the nearest one that can be built rather than building the
	 * one that cannot, and {@link problems} stays for whatever settling cannot
	 * reach.
	 */
	static fromParams(params: URLSearchParams): PlanetSettings {
		const knobs: Partial<PlanetKnobs> = {};
		for (const key of Object.keys(
			PLANET_DEFAULTS,
		) as (keyof PlanetKnobs)[]) {
			if (TRANSIENT.has(key)) continue;
			const raw = params.get(key);
			if (raw === null) continue;
			if (key === "seed") knobs.seed = raw;
			else if (key === "noiseBasis") knobs.noiseBasis = raw as NoiseBasis;
			else if (key === "cellFeature")
				knobs.cellFeature = raw as CellFeature;
			else if (typeof PLANET_DEFAULTS[key] === "boolean")
				(knobs as unknown as Record<string, boolean>)[key] =
					raw === "true";
			else {
				const value = Number.parseFloat(raw);
				if (Number.isFinite(value))
					(knobs as unknown as Record<string, number>)[key] = value;
			}
		}
		// A link written before depth was asked for directly names a radius.
		// Depth, block size and radius are one quantity, so the depth that
		// radius meant is recoverable exactly.
		const radius = params.get("radius");
		if (radius !== null && params.get("subdivisionDepth") === null) {
			const metres = Number.parseFloat(radius);
			if (Number.isFinite(metres))
				knobs.subdivisionDepth = Math.max(
					1,
					levelFor(
						CELL_CONSTANT * metres,
						knobs.blockSize ?? PLANET_DEFAULTS.blockSize,
					),
				);
		}
		return new PlanetSettings(
			PlanetSettings.settle({ ...PLANET_DEFAULTS, ...knobs }),
		);
	}

	/**
	 * The query string this world travels as.
	 *
	 * Only what differs from the defaults, so a link stays short and says what
	 * was actually chosen.
	 */
	toParams(): URLSearchParams {
		const params = new URLSearchParams();
		for (const key of Object.keys(
			PLANET_DEFAULTS,
		) as (keyof PlanetKnobs)[]) {
			if (TRANSIENT.has(key)) continue;
			const value = this.knobs[key];
			if (value !== PLANET_DEFAULTS[key]) params.set(key, String(value));
		}
		return params;
	}
}
