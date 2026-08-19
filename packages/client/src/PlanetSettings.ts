import type {
	CoarseMapOptions,
	Landform,
	TerrainOptions,
} from "chamfer/generation";
import { CoarseMap, seedFromString } from "chamfer/generation";
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
	 * Whether the height map runs at all. Off is a smooth sphere at sea level,
	 * which is the only state the level of detail can be judged in.
	 */
	coarseMap: boolean;

	/** Which way the land is decided. */
	landform: Landform;

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

	/** How far a second field pushes the sample point. `warped` only. */
	warpAmplitude: number;

	/** Metres across the widest feature of the field doing the pushing. */
	warpScale: number;

	/** Metres from sea level to the tallest ground. */
	relief: number;

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
	plain: false,
	radius: 6800,
	blockSize: 1,
	chunkCells: 32,
	coarseMap: true,
	landform: "noise",
	coarseSpacing: 32,
	noiseScale: 4500,
	octaves: 4,
	persistence: 0.5,
	lacunarity: 2,
	offsetX: 0,
	offsetY: 0,
	warpAmplitude: 0.35,
	warpScale: 4250,
	relief: 300,
	erosion: 0,
	landFraction: 0.3,
	crustMetres: 960,
	atmosphereTop: 400,
	zenithDepth: 0.134,
	cloudsDrawn: true,
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
	landform: { low: 0, high: 0, step: 1, rebuilds: true, unit: "" },
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
	relief: { low: 20, high: 2400, step: 20, rebuilds: true, unit: "m" },
	erosion: { low: 0, high: 1, step: 0.05, rebuilds: true, unit: "" },
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
	cloudsDrawn: { ...TOGGLE, rebuilds: false },
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
	 * Whether the shell budget, rather than rounding, decided the cloud level.
	 *
	 * When it did, moving Puff alone changes nothing at all until it comes
	 * back inside the budget, which is what a knob that feels dead looks like.
	 */
	get cloudLevelCapped(): boolean {
		return (
			cloudLevelBudget(this.knobs.cloudShells) <
			levelFor(CELL_CONSTANT * this.radius, this.knobs.cloudPuff)
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
	 * The peak is exactly Relief, and the floor is what Land decides. Sea level
	 * is a percentile of the noise, so asking for less land pushes it up the
	 * field and leaves the sea floor further under it: measured on two
	 * landforms at level 6, the whole span came to `1.69` times Relief at a
	 * land fraction of `0.8`, `2.18` at `0.5`, `2.69` at `0.3` and `4.71` at
	 * `0.1`. This is a curve through those with a little room over each.
	 *
	 * **A sea floor through the bottom of the world is a flat abyss**, not a
	 * crash: the crust clamps it. It is still worth refusing, because a world
	 * whose ocean floor is one plateau is not the world the map drew.
	 */
	get groundSpan(): number {
		const land = Math.min(0.95, Math.max(0.05, this.knobs.landFraction));
		return Math.max(
			2,
			this.relief * (1 + 1.4 * Math.sqrt((1 - land) / land)),
		);
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
			landform: this.knobs.landform,
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
			relief: this.relief,
			landFraction: this.knobs.landFraction,
			erosion: this.knobs.erosion,
		};
	}

	terrainOptions(): TerrainOptions {
		return { snowLine: 0.72 * this.relief };
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
			// The address is 2 bits of path per level, and the word is 64. The
			// depth is a rounded logarithm, so the largest radius one block size
			// allows is where that logarithm still rounds down to MAX_DEPTH.
			case "radius":
				return narrowed({
					high: down(
						(k.blockSize * 2 ** (MAX_DEPTH + 0.5)) / CELL_CONSTANT,
					),
				});
			case "blockSize":
				return narrowed({
					low: up(
						(CELL_CONSTANT * k.radius) / 2 ** (MAX_DEPTH + 0.5),
					),
				});

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
	 * {@link groundSpan} is linear in Relief, so this is that relationship read
	 * backwards: whatever multiple of Relief the sea floor adds at this land
	 * fraction, divide the deepest possible crust by it.
	 */
	get reliefCeiling(): number {
		const perMetre = this.relief > 0 ? this.groundSpan / this.relief : 1;
		return this.crustCeiling / Math.max(1, perMetre);
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
			"radius",
			"chunkCells",
			"coarseSpacing",
			"noiseScale",
			"octaves",
			"relief",
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
				`The crust reaches ${Math.round(reach)} m and the ground spans about ${Math.round(this.groundSpan)} m, so the deepest ocean has no floor: those columns are water down to the last layer and nothing under it. Raise Crust reaches to at least ${neededCrust} m, or lower Relief to ${Math.floor((reach * this.relief) / Math.max(1, this.groundSpan))} m or under.`,
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

	/** Read a world out of a query string, falling back on the defaults. */
	static fromParams(params: URLSearchParams): PlanetSettings {
		const knobs: Partial<PlanetKnobs> = {};
		for (const key of Object.keys(
			PLANET_DEFAULTS,
		) as (keyof PlanetKnobs)[]) {
			const raw = params.get(key);
			if (raw === null) continue;
			if (key === "seed") knobs.seed = raw;
			else if (key === "landform") knobs.landform = raw as Landform;
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
