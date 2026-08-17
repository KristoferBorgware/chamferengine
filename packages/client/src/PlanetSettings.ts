import type { CoarseMapOptions, TerrainOptions } from "chamfer/generation";
import { CELL_CONSTANT, WorldShape, maxCrustDepth } from "chamfer/world";

/** How many layers the ten-bit layer field can name. */
const LAYER_CEILING = 1024;

/** The deepest the address word reaches, from doc 03's arithmetic. */
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
 * What a person sets, before anything is derived from it.
 *
 * Every one of these is in metres or in cells — something a person can picture.
 * Subdivision depth, chunk level and coarse level are not here: those follow
 * from a size and a radius, and putting them in would have the dependency
 * backwards.
 */
export interface PlanetKnobs {
	seed: string;

	/** Metres. Moved slightly so the block size comes out exact. */
	radius: number;

	/** Metres across one cell. */
	blockSize: number;

	/** Cells along one edge of a chunk. */
	chunkCells: number;

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

	/** How deep a chunk's rim hangs, in its own cells. */
	skirtCells: number;

	/** Seconds in a day. */
	dayLength: number;
}

export const PLANET_DEFAULTS: PlanetKnobs = {
	seed: "chamfer",
	radius: 6800,
	blockSize: 1,
	chunkCells: 32,
	coarseSpacing: 32,
	heightScale: 200,
	reliefFeature: 280,
	detailAmplitude: 5,
	detailFeature: 112,
	landFraction: 0.3,
	crustMetres: 900,
	atmosphereTop: 400,
	zenithDepth: 0.134,
	lowDeck: 220,
	highDeck: 900,
	cloudPuff: 64,
	cloudShells: 1,
	detail: 2,
	skirtCells: 2,
	dayLength: 240,
};

/** A knob that is a number, and what it may be set to. */
export interface KnobRange {
	readonly low: number;
	readonly high: number;
	readonly step: number;

	/** Whether changing it means building the world again. */
	readonly rebuilds: boolean;

	readonly unit: string;
}

export const KNOB_RANGES: Record<string, KnobRange> = {
	radius: { low: 850, high: 25000, step: 50, rebuilds: true, unit: "m" },
	blockSize: { low: 0.5, high: 4, step: 0.25, rebuilds: true, unit: "m" },
	chunkCells: { low: 8, high: 64, step: 8, rebuilds: true, unit: "cells" },
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
	lowDeck: { low: 100, high: 3000, step: 20, rebuilds: false, unit: "m" },
	highDeck: { low: 200, high: 6000, step: 50, rebuilds: false, unit: "m" },
	cloudPuff: { low: 8, high: 128, step: 8, rebuilds: false, unit: "m" },
	cloudShells: { low: 1, high: 8, step: 1, rebuilds: false, unit: "shells" },
	detail: { low: 1, high: 5, step: 0.5, rebuilds: false, unit: "widths" },
	skirtCells: { low: 0, high: 4, step: 1, rebuilds: true, unit: "cells" },
	dayLength: { low: 30, high: 3600, step: 10, rebuilds: false, unit: "s" },
};

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

	/** How many times a face is split. Follows from the block and the radius. */
	get depth(): number {
		const wanted = levelFor(
			CELL_CONSTANT * this.knobs.radius,
			this.knobs.blockSize,
		);
		return Math.max(1, Math.min(MAX_DEPTH, wanted));
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
				levelFor(CELL_CONSTANT * this.radius, this.knobs.coarseSpacing),
			),
		);
	}

	/** How many layers deep the world runs, under both caps. */
	get crustDepth(): number {
		const wanted = Math.ceil(this.knobs.crustMetres / this.knobs.blockSize);
		return Math.max(
			8,
			Math.min(wanted, maxCrustDepth(this.depth), LAYER_CEILING),
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
				10,
				levelFor(CELL_CONSTANT * this.radius, this.knobs.cloudPuff),
			),
		);
	}

	/** Metres across one cloud puff, once its level is rounded. */
	get cloudPuff(): number {
		return (CELL_CONSTANT * this.radius) / 2 ** this.cloudLevel;
	}

	/**
	 * Metres of ground above sea level, and the whole spread from floor to peak.
	 *
	 * Elevation is linear in the height scale, so both follow from it. Measured
	 * over 3,000 places on the worked seed, the tallest ground is **0.50** of
	 * the height scale and the spread from the deepest sea floor to the highest
	 * peak is **1.15** of it, at every amplitude tried. The margins here are
	 * for the seeds that were not tried, and for the landform size, which moves
	 * both figures by about a tenth.
	 *
	 * This is not a knob. Setting it above the ground costs generation time for
	 * air nobody reaches: a column is written from the crust top downward, so
	 * every metre of empty sky above the tallest peak is a layer evaluated on
	 * every column of every chunk.
	 */
	get maxElevation(): number {
		return Math.ceil(0.6 * this.knobs.heightScale);
	}

	/** How far the ground spreads, floor to peak, before anyone digs. */
	get groundSpan(): number {
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
	 * The three things the engine is handed, in the shapes it takes them.
	 *
	 * A knob that reaches no further than this class is a slider that moves and
	 * changes nothing, which is worse than no slider, so every knob a subsystem
	 * has an option for is passed here rather than left at its default.
	 */
	shape(): WorldShape {
		return new WorldShape(
			this.radius,
			this.depth,
			this.maxElevation,
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
			detailAmplitude: this.knobs.detailAmplitude,
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

		if (this.depth >= MAX_DEPTH)
			out.push(
				`A ${k.blockSize} m block on a ${Math.round(k.radius)} m radius needs more than the ${MAX_DEPTH} levels the address word holds.`,
			);

		// The crust has to reach from the top of the tallest ground to under
		// the deepest sea, or the sea floor falls out of the bottom of the
		// world and every ocean column is empty.
		const reach = this.crustDepth * k.blockSize;
		if (reach < this.groundSpan)
			out.push(
				`The crust reaches ${Math.round(reach)} m and the ground spans about ${Math.round(this.groundSpan)} m, so the sea floor would fall through the bottom of the world.`,
			);

		if (this.coarseCell < k.blockSize * 2)
			out.push(
				`A ${Math.round(this.coarseCell)} m coarse cell is no coarser than a ${k.blockSize} m block, so the map that carries rivers has nothing left to carry.`,
			);

		// Two samples across a feature is the least that describes it. Below
		// that the map records something narrower than it can see, and what it
		// records changes with the resolution rather than with the seed.
		if (this.coarseCell * 2 > this.smallestLandform)
			out.push(
				`The smallest hill is ${Math.round(this.smallestLandform)} m across and a coarse cell is ${Math.round(this.coarseCell)} m, so the map cannot carry the hills it is being asked for.`,
			);

		if (this.maxElevation < k.detailAmplitude * 2)
			out.push(
				`Ground reaches ${this.maxElevation} m and the detail alone moves it ${k.detailAmplitude} m, so the tallest ground would be clipped flat.`,
			);

		if (this.chunkLevel <= 0)
			out.push(
				`A ${k.chunkCells}-cell chunk at depth ${this.depth} is the whole face, which leaves nothing for the level of detail to walk down.`,
			);

		if (k.highDeck <= k.lowDeck)
			out.push(
				`The high cloud deck sits at ${k.highDeck} m and the low one at ${k.lowDeck} m, so they are inside out.`,
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
