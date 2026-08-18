import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import type { CoarseStage } from "./CoarseStage.js";
import { COARSE_MAP_DEFAULTS } from "./CoarseMapOptions.js";
import { COARSE_STAGES } from "./CoarseStage.js";
import { CoarseGrid } from "./CoarseGrid.js";
import { CoarseMap } from "./CoarseMap.js";
import { accumulateFlow } from "./accumulateFlow.js";
import { coarseSlope } from "./coarseSlope.js";
import { continentHeight } from "./continentHeight.js";
import { erode } from "./erode.js";
import { fillPits } from "./fillPits.js";
import { routeFlow } from "./routeFlow.js";
import { seaLevelFor } from "./seaLevelFor.js";

/** One step finished, and the map as it stands after it. */
export interface CoarseMapStep {
	readonly stage: CoarseStage;

	/** Every field filled, with the stages not yet run holding what they can. */
	readonly map: CoarseMap;

	/** Whether this is the last step, so the map is the finished one. */
	readonly done: boolean;
}

/**
 * A coarse map built one step at a time, holding what it can between runs.
 *
 * Two things a single call cannot do. A caller that wants to draw the map while
 * it is still being built needs each step handed back as it lands, which is
 * what iterating this gives. And a caller changing one option does not want the
 * steps above it computed again — the grid never changes, and neither does the
 * height field when only the erosion rate moved.
 *
 * The grid is held for the builder's whole life and costs 413 ms at level 8.
 * The raw height field is held beside the eroded one, because erosion writes in
 * place and a rerun has to start from ground nothing has cut yet.
 *
 * **Running from a later step gives the same map as running from the first.**
 * Held ground and freshly computed ground are identical at every cell, so this
 * is exact rather than an approximation of a full build.
 */
export class CoarseMapBuilder {
	readonly grid: CoarseGrid;

	/** The surface before erosion, held so a later step can start again. */
	private raw?: Float64Array;

	private height?: Float64Array;
	private seaLevel?: number;
	private flow?: Float32Array;
	private water?: Float32Array;
	private slope?: Float32Array;
	private seed = 0;

	constructor(level: number) {
		this.grid = new CoarseGrid(level);
	}

	/**
	 * Run from `from` onward, handing back the map after each step.
	 *
	 * Steps above `from` read what the last run left. Passing `"height"`, which
	 * is the default, holds nothing and rebuilds everything.
	 */
	*build(
		seed: number,
		options: CoarseMapOptions = {},
		from: CoarseStage = "height",
	): Generator<CoarseMapStep> {
		const settings = { ...COARSE_MAP_DEFAULTS, ...options };
		const grid = this.grid;
		this.seed = seed;
		// A step can only be started from if the one above it left something to
		// start from. A first run holds nothing, so it begins at the top whatever
		// it was asked for.
		const asked = COARSE_STAGES.indexOf(from);
		const at = this.raw === undefined ? 0 : asked;

		if (at <= 0)
			this.raw = continentHeight(
				grid,
				seed,
				settings.continentFrequency,
				settings.continentOctaves,
				settings.reliefFrequency,
				settings.reliefOctaves,
				settings.reliefAmplitude,
			);
		if (at <= 0) {
			// Nothing downstream has run, so the sea is wherever it was last and
			// the rivers are empty. Drawing this shows the raw surface, which is
			// what the continent knobs are turned against.
			this.height = Float64Array.from(this.raw!);
			yield this.step("height", false);
		}

		if (at <= 1 || this.seaLevel === undefined)
			this.seaLevel = seaLevelFor(this.raw!, settings.landFraction);
		if (at <= 1) yield this.step("sea", false);

		if (at <= 2) {
			// Erosion writes in place, so it starts from a copy of ground nothing
			// has cut. That copy is why the raw field is held separately.
			this.height = Float64Array.from(this.raw!);
			erode(
				grid,
				this.height,
				this.seaLevel!,
				settings.erosionPasses,
				settings.erosionRate,
			);
			yield this.step("erosion", false);
		}

		if (at <= 3) {
			const sea = this.seaLevel!;
			const filled = fillPits(grid, this.height!, sea);
			const down = routeFlow(grid, filled, sea);
			this.flow = Float32Array.from(
				accumulateFlow(grid, filled, down, sea),
			);
			// The ocean stands at sea level rather than on the seabed, so one
			// field answers "how high is the water here" over ocean, lake and dry
			// land alike.
			const water = new Float32Array(grid.count);
			for (let cell = 0; cell < grid.count; cell++)
				water[cell] = Math.max(filled[cell]!, this.seaLevel!);
			this.water = water;
			yield this.step("rivers", false);
		}

		this.slope = coarseSlope(grid, this.height!);
		yield this.step("slope", true);
	}

	/** The map as it stands, with anything not yet computed holding zero. */
	private step(stage: CoarseStage, done: boolean): CoarseMapStep {
		const count = this.grid.count;
		const empty = new Float32Array(count);
		return {
			stage,
			done,
			map: new CoarseMap(
				this.seed,
				this.grid,
				this.seaLevel ?? 0,
				Float32Array.from(this.height ?? empty),
				this.water ?? this.flatWater(),
				this.flow ?? empty,
				this.slope ?? empty,
			),
		};
	}

	/** Water at sea level everywhere, for a map whose rivers have not run. */
	private flatWater(): Float32Array {
		const water = new Float32Array(this.grid.count);
		if (this.seaLevel) water.fill(this.seaLevel);
		return water;
	}

	/** Run every step and return the finished map, discarding the rest. */
	run(
		seed: number,
		options: CoarseMapOptions = {},
		from: CoarseStage = "height",
	): CoarseMap {
		let last: CoarseMap | undefined;
		for (const step of this.build(seed, options, from)) last = step.map;
		return last!;
	}
}
