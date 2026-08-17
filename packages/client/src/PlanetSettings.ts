import type { CoarseMapOptions, TerrainOptions } from "chamfer/generation";
import { CoarseMap } from "chamfer/generation";
import { CELL_CONSTANT, WorldShape, maxCrustDepth } from "chamfer/world";
import { LAYER_COUNT, wordBits } from "chamfer/addressing";
import type { CloudDeckSetup } from "chamfer/sky";

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
 * needs a new measurement, the same way `CLOUD_POINT_SHELL_BUDGET` does.
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

	/** Metres. Moved slightly so the block size comes out exact. */
	radius: number;

	/** Metres across one cell. */
	blockSize: number;

	/** Cells along one edge of a chunk. */
	chunkCells: number;

	/**
	 * Whether the coarse map runs at all: continents, sea, relief, rivers and
	 * erosion. Off is the one-tier height field doc 08 describes before the
	 * coarse tier existed -- dry, with the detail term the only relief.
	 */
	coarseMap: boolean;

	/** Metres across one cell of the map that carries continents and rivers. */
	coarseSpacing: number;

	/** Metres of elevation one unit of the coarse map stands for. */
	heightScale: number;

	/** Metres across the largest hill or valley the coarse map carries. */
	reliefFeature: number;

	/** Metres the fine detail moves the surface by. */
	detailAmplitude: number;

	/** Metres across the largest feature the fine detail makes. */
	detailFeature: number;

	/** How much of the surface stands above the sea. */
	landFraction: number;

	/** Metres from the top of the tallest ground to the floor of the world. */
	crustMetres: number;

	/** Metres to the top of the air. */
	atmosphereTop: number;

	/** How thick the air reads straight up. */
	zenithDepth: number;

	/** Metres to each cloud deck. */
	lowDeck: number;
	highDeck: number;

	/** Metres across one cloud puff. */
	cloudPuff: number;

	/** How many shells deep a deck runs. One is a flat sheet. */
	cloudShells: number;

	/** How many times its own width a chunk is away before it drops a level. */
	detail: number;

	/** Whether a chunk draws the ring of cells just beyond its rim. */
	apron: boolean;

	/** Whether the terrain paints its seams: face edges, chunk rims, aprons. */
	seamOverlay: boolean;

	/** Seconds in a day. */
	dayLength: number;

	/** Whether the day and night cycle advances. */
	paused: boolean;

	/** The fraction of a day to show while paused, 0 at midnight to 1 at the next. */
	timeOfDay: number;
}

export const PLANET_DEFAULTS: PlanetKnobs = {
	seed: "chamfer",
	plain: true,
	radius: 6800,
	blockSize: 1,
	chunkCells: 32,
	coarseMap: true,
	coarseSpacing: 32,
	heightScale: 200,
	reliefFeature: 280,
	detailAmplitude: 5,
	detailFeature: 112,
	landFraction: 0.3,
	crustMetres: 900,
	atmosphereTop: 400,
	zenithDepth: 0.134,
	lowDeck: 400,
	highDeck: 1200,
	cloudPuff: 64,
	cloudShells: 4,
	detail: 2,
	apron: true,
	seamOverlay: false,
	dayLength: 240,
	paused: false,
	timeOfDay: 0.5,
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
	radius: { low: 850, high: 25000, step: 50, rebuilds: true, unit: "m" },
	blockSize: { low: 0.5, high: 4, step: 0.25, rebuilds: true, unit: "m" },
	chunkCells: { low: 8, high: 64, step: 8, rebuilds: true, unit: "cells" },
	coarseMap: { ...TOGGLE, rebuilds: true },
	coarseSpacing: { low: 4, high: 128, step: 4, rebuilds: true, unit: "m" },
	heightScale: { low: 20, high: 1200, step: 20, rebuilds: true, unit: "m" },
	reliefFeature: {
		low: 128,
		high: 4096,
		step: 16,
		rebuilds: true,
		unit: "m",
	},
	detailAmplitude: { low: 0, high: 60, step: 1, rebuilds: true, unit: "m" },
	detailFeature: { low: 16, high: 512, step: 8, rebuilds: true, unit: "m" },
	landFraction: {
		low: 0.05,
		high: 0.8,
		step: 0.05,
		rebuilds: true,
		unit: "",
	},
	crustMetres: { low: 32, high: 1024, step: 16, rebuilds: true, unit: "m" },
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
	lowDeck: { low: 100, high: 3000, step: 20, rebuilds: true, unit: "m" },
	highDeck: { low: 200, high: 6000, step: 50, rebuilds: true, unit: "m" },
	cloudPuff: { low: 8, high: 128, step: 8, rebuilds: true, unit: "m" },
	cloudShells: { low: 1, high: 8, step: 1, rebuilds: true, unit: "shells" },
	detail: { low: 1, high: 5, step: 0.5, rebuilds: false, unit: "widths" },
	apron: { ...TOGGLE, rebuilds: true },
	seamOverlay: { ...TOGGLE, rebuilds: true },
	dayLength: { low: 30, high: 3600, step: 10, rebuilds: false, unit: "s" },
	paused: { ...TOGGLE, rebuilds: false },
	timeOfDay: { low: 0, high: 1, step: 0.01, rebuilds: false, unit: "" },
};

/** The nearest power of two, for turning a size in metres into a level. */
function levelFor(span: number, size: number): number {
	return Math.max(0, Math.round(Math.log2(span / size)));
}

/**
 * How many lattice points times shells one cloud deck may hold.
 *
 * Calibrated from the shipped default -- level 7, 4 shells, 163,842 points,
 * measured at 500-900 ms to build -- the heaviest deck anyone has actually
 * run. A deck asking for more crashes the renderer rather than reading
 * expensive: two decks at level 9 and 3 shells filled a combined vertex
 * buffer past the device's 256 MiB buffer limit on real hardware. The budget
 * divides shells out of the ceiling it gives a level, so raising Shells
 * lowers what Puff is allowed to ask for -- the same trade the mesh already
 * makes between how deep a cloud reads and how finely it is drawn.
 */
const CLOUD_POINT_SHELL_BUDGET = 700_000;

/** The finest cloud level this many shells may run at, under the budget. */
function cloudLevelBudget(shells: number): number {
	let level = 10;
	while (
		level > 2 &&
		(10 * 4 ** level + 2) * shells > CLOUD_POINT_SHELL_BUDGET
	)
		level--;
	return level;
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
	 * Metres the fine detail moves the surface by, once the pause is applied.
	 *
	 * Zero under the pause, and zero is exact rather than small: `fbm` is
	 * multiplied by it, so the detail term leaves the elevation untouched and
	 * the ground is a sphere to the last bit.
	 */
	get detailAmplitude(): number {
		return this.knobs.plain ? 0 : this.knobs.detailAmplitude;
	}

	/** The depth the radius and the block size ask for, before any cap. */
	private get wantedDepth(): number {
		return Math.max(
			1,
			levelFor(CELL_CONSTANT * this.knobs.radius, this.knobs.blockSize),
		);
	}

	/** How many times a face is split. Follows from the block and the radius. */
	get depth(): number {
		return Math.min(MAX_DEPTH, this.wantedDepth);
	}

	/**
	 * The radius the world actually has.
	 *
	 * Block size is fixed at world creation and the radius absorbs the level
	 * rounding, so this is the asked-for radius moved to the nearest one that
	 * gives the block size exactly.
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
	 * Which level the cloud lattice is taken from.
	 *
	 * A cloud borrows the lattice without being a cell of it, so this is asked
	 * for as a puff size in metres and answered as a level, the same way the
	 * coarse map is.
	 */
	get cloudLevel(): number {
		return Math.max(
			2,
			Math.min(
				cloudLevelBudget(this.knobs.cloudShells),
				levelFor(CELL_CONSTANT * this.radius, this.knobs.cloudPuff),
			),
		);
	}

	/** Metres across one cloud puff, once its level is rounded. */
	get cloudPuff(): number {
		return (CELL_CONSTANT * this.radius) / 2 ** this.cloudLevel;
	}

	/**
	 * The two decks the engine builds, as the numbers a cloud worker takes.
	 *
	 * Shell spacing and the noise feature deciding a shell's shape both follow
	 * the puff size rather than being asked for separately: a deck built from
	 * wider puffs gets taller, wider shells to match, so raising Puff scales a
	 * cloud rather than only its footprint.
	 */
	cloudDecks(): CloudDeckSetup[] {
		const shellSpan = this.cloudPuff * 0.75;
		const featureSize = this.cloudPuff * 1.5;
		const deck = (height: number): CloudDeckSetup => ({
			level: this.cloudLevel,
			shells: this.knobs.cloudShells,
			baseRadius: this.radius + height,
			shellSpan,
			featureSize,
		});
		return [deck(this.knobs.lowDeck), deck(this.knobs.highDeck)];
	}

	/**
	 * A pre-build guess at how far the ground reaches above sea level.
	 *
	 * Elevation is linear in the height scale, so this scales with it. Measured
	 * over 3,000 places on the worked seed **at the default land fraction of
	 * 0.3**, the tallest ground came out at 0.50 of the height scale, and this
	 * keeps a margin above that.
	 *
	 * **This is a guess, not a bound, and Land moves it a lot.** Sea level is a
	 * percentile of the height field, so raising Land pushes sea level down and
	 * leaves more of the same field standing above it: measured at landFraction
	 * 0.05 the tallest ground is 0.25 of the height scale, and at 0.8 it is
	 * 0.77 — three times higher. Nothing here reads Land, because this getter
	 * exists to answer the panel's sliders before a coarse map has been built,
	 * and Land's effect on sea level is not known until one has. Once a map
	 * exists, {@link tallestGroundOf} gives the true figure and
	 * {@link shapeFor} uses it — never this — to build the world, which is what
	 * keeps a Land of 0.8 from silently shearing the mountaintops flat.
	 *
	 * With the coarse map off there is no guess to make: elevation is the
	 * detail term alone, bounded exactly to `[-detailAmplitude,
	 * detailAmplitude]`, so this is that bound rather than a ratio.
	 */
	get maxElevation(): number {
		if (!this.coarseMapRuns)
			return Math.max(1, Math.ceil(this.detailAmplitude));
		return Math.ceil(0.6 * this.knobs.heightScale);
	}

	/**
	 * The exact metres of ground above sea level the coarse map's own numbers
	 * reach, once the detail term's reach is added.
	 *
	 * Not a measurement: `fbm` is bounded to `[-1, 1]` by construction — a
	 * weighted sum of values already in that range, divided by the weights'
	 * own total — so `detailAmplitude * fbm(...)` can never exceed
	 * `detailAmplitude` in either direction. Adding it to the coarse map's own
	 * highest cell gives the true ceiling, not an estimate of it.
	 */
	tallestGroundOf(map: CoarseMap): number {
		let highest = -Infinity;
		for (let cell = 0; cell < map.count; cell++)
			if (map.height[cell]! > highest) highest = map.height[cell]!;
		const metres =
			(highest - map.seaLevel) * this.knobs.heightScale +
			this.detailAmplitude;
		return Math.max(1, Math.ceil(metres));
	}

	/**
	 * How far the ground spreads, floor to peak, before anyone digs.
	 *
	 * With the coarse map off the true spread is exactly twice the detail
	 * amplitude — there is no coarse variation to add a margin for.
	 */
	get groundSpan(): number {
		if (!this.coarseMapRuns) return Math.max(2, 2 * this.detailAmplitude);
		return 1.3 * this.knobs.heightScale;
	}

	/** Metres across one cell of the coarse map, once its level is rounded. */
	get coarseCell(): number {
		return (CELL_CONSTANT * this.radius) / 2 ** this.coarseLevel;
	}

	/**
	 * How many octaves the relief tier runs, and the smallest hill it makes.
	 *
	 * Each octave is half the width of the one above, so the count is however
	 * many halvings fit between the largest landform and the smallest. Asking
	 * for wider hills therefore buys octaves and asking for narrower ones spends
	 * them, which keeps the finest hill the same size on every planet.
	 */
	get reliefOctaves(): number {
		const halvings = Math.log2(
			this.knobs.reliefFeature / SMALLEST_LANDFORM,
		);
		return Math.max(1, Math.floor(halvings) + 1);
	}

	get smallestLandform(): number {
		return this.knobs.reliefFeature / 2 ** (this.reliefOctaves - 1);
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
			level: this.coarseLevel,
			landFraction: this.knobs.landFraction,
			reliefFrequency: this.frequencyFor(this.knobs.reliefFeature),
			reliefOctaves: this.reliefOctaves,
		};
	}

	terrainOptions(): TerrainOptions {
		return {
			heightScale: this.knobs.heightScale,
			detailAmplitude: this.detailAmplitude,
			detailFrequency: this.frequencyFor(this.knobs.detailFeature),
		};
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

		if (this.wantedDepth > MAX_DEPTH) {
			// The largest block that keeps this radius under the word: solve
			// CELL_CONSTANT * radius / 2^MAX_DEPTH for the block size.
			const largestBlock = (
				(CELL_CONSTANT * k.radius) /
				2 ** MAX_DEPTH
			).toFixed(2);
			out.push(
				`A ${k.blockSize} m block on a ${Math.round(k.radius)} m radius splits a face ${this.wantedDepth} times, which needs a ${wordBits(this.wantedDepth)}-bit address, and the word is 64. Lower Radius, or raise Block size to at least ${largestBlock} m.`,
			);
		}

		// The crust has to reach from the top of the tallest ground to under
		// the deepest sea, or the sea floor falls out of the bottom of the
		// world and every ocean column is empty.
		const reach = this.crustDepth * k.blockSize;
		if (reach < this.groundSpan) {
			const neededCrust = Math.ceil(this.groundSpan);
			out.push(
				this.coarseMapRuns
					? `The crust reaches ${Math.round(reach)} m and the ground spans about ${Math.round(this.groundSpan)} m, so the sea floor would fall through the bottom of the world. Raise Crust reaches to at least ${neededCrust} m, or lower Height scale to ${Math.floor(reach / 1.3)} m or under.`
					: `The crust reaches ${Math.round(reach)} m and the ground spans about ${Math.round(this.groundSpan)} m, so the sea floor would fall through the bottom of the world. Raise Crust reaches to at least ${neededCrust} m, or lower Detail to ${Math.floor(reach / 2)} m or under.`,
			);
		}

		// The coarse map's own resolution only matters while it runs. Off, its
		// level is a fixed cheap constant nothing reads, so these two checks
		// would be warning about a knob with nothing left to affect.
		if (this.coarseMapRuns) {
			if (this.coarseCell < k.blockSize * 2) {
				const neededSpacing = Math.ceil(k.blockSize * 2);
				out.push(
					`A ${Math.round(this.coarseCell)} m coarse cell is no coarser than a ${k.blockSize} m block, so the map that carries rivers has nothing left to carry. Raise Coarse cell to at least ${neededSpacing} m.`,
				);
			}

			// Two samples across a feature is the least that describes it. Below
			// that the map records something narrower than it can see, and what
			// it records changes with the resolution rather than with the seed.
			if (this.coarseCell * 2 > this.smallestLandform) {
				const largestSpacing = Math.floor(this.smallestLandform / 2);
				const neededLandform = Math.ceil(this.coarseCell * 2);
				out.push(
					`The smallest hill is ${Math.round(this.smallestLandform)} m across and a coarse cell is ${Math.round(this.coarseCell)} m, so the map cannot carry the hills it is being asked for. Lower Coarse cell to ${largestSpacing} m or under, or raise Landform across so the smallest hill reaches at least ${neededLandform} m.`,
				);
			}

			// Off, maxElevation is defined as exactly enough to cover the detail
			// term (see the getter), so this can never fire and would be
			// warning about a clipping risk that does not exist in that mode.
			if (this.maxElevation < this.detailAmplitude * 2) {
				const neededHeightScale = Math.ceil(
					(this.detailAmplitude * 2) / 0.6,
				);
				const largestDetail = Math.floor(this.maxElevation / 2);
				out.push(
					`Ground reaches ${this.maxElevation} m and the detail alone moves it ${this.detailAmplitude} m, so the tallest ground would be clipped flat. Raise Height scale to at least ${neededHeightScale} m, or lower Detail to ${largestDetail} m or under.`,
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

	/** Read a world out of a query string, falling back on the defaults. */
	static fromParams(params: URLSearchParams): PlanetSettings {
		const knobs: Partial<PlanetKnobs> = {};
		for (const key of Object.keys(
			PLANET_DEFAULTS,
		) as (keyof PlanetKnobs)[]) {
			const raw = params.get(key);
			if (raw === null) continue;
			if (key === "seed") knobs.seed = raw;
			else if (typeof PLANET_DEFAULTS[key] === "boolean")
				(knobs as unknown as Record<string, boolean>)[key] =
					raw === "true";
			else {
				const value = Number.parseFloat(raw);
				if (Number.isFinite(value))
					(knobs as unknown as Record<string, number>)[key] = value;
			}
		}
		return new PlanetSettings(knobs);
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
			const value = this.knobs[key];
			if (value !== PLANET_DEFAULTS[key]) params.set(key, String(value));
		}
		return params;
	}
}
