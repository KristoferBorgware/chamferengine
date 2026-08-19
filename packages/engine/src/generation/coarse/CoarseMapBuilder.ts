import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import type { CoarseStage } from "./CoarseStage.js";
import { COARSE_MAP_DEFAULTS } from "./CoarseMapOptions.js";
import { COARSE_STAGES } from "./CoarseStage.js";
import { CoarseGrid } from "./CoarseGrid.js";
import { CoarseMap } from "./CoarseMap.js";
import { erodeDroplets } from "./erodeDroplets.js";
import { landformHeight } from "./landformHeight.js";
import { metreHeight } from "./metreHeight.js";

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
 * steps above it computed again -- the grid never changes, and neither does the
 * noise field when only the erosion moved.
 *
 * The grid is held for the builder's whole life and costs 413 ms at level 8.
 * The unitless field is held beside the metric one, and the uneroded metric
 * field beside the eroded one, because both later steps write in place and a
 * rerun has to start from ground nothing has cut yet.
 *
 * **Running from a later step gives the same map as running from the first.**
 * Held ground and freshly computed ground are identical at every cell, so this
 * is exact rather than an approximation of a full build.
 */
export class CoarseMapBuilder {
	readonly grid: CoarseGrid;

	/** The surface with no unit, held so a later step can start again. */
	private raw?: Float64Array;

	/** The surface in metres before erosion, held for the same reason. */
	private metres?: Float64Array;

	private height?: Float64Array;
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
		until: CoarseStage = COARSE_STAGES[COARSE_STAGES.length - 1]!,
	): Generator<CoarseMapStep> {
		const settings = { ...COARSE_MAP_DEFAULTS, ...options };
		const grid = this.grid;
		this.seed = seed;
		// A step can only be started from if the one above it left something to
		// start from. A first run holds nothing, so it begins at the top whatever
		// it was asked for.
		const asked = COARSE_STAGES.indexOf(from);
		const at = this.raw === undefined ? 0 : asked;
		// A caller wanting a picture of the ground before the water does not
		// wait for the water. The steps below the last one it asked for are not
		// run, and the map it gets back holds what has been computed so far.
		const last = COARSE_STAGES.indexOf(until);

		if (at <= 0) {
			this.raw = landformHeight(grid, seed, settings);
			// Nothing downstream has run, so the ground is the noise itself with
			// no sea in it. Drawing this shows what the octave knobs are turned
			// against.
			this.height = Float64Array.from(this.raw);
			yield this.step("height", last <= 0);
		}
		if (last <= 0) return;

		if (at <= 1 || this.metres === undefined)
			this.metres = metreHeight(
				this.raw!,
				settings.landFraction,
				settings.relief,
			);
		if (at <= 1) {
			this.height = Float64Array.from(this.metres!);
			yield this.step("metres", last <= 1);
		}
		if (last <= 1) return;

		// Erosion writes in place, so it starts from a copy of ground nothing
		// has cut. That copy is why the metric field is held separately.
		this.height = Float64Array.from(this.metres!);
		erodeDroplets(
			grid,
			this.height,
			seed,
			settings.erosion,
			settings.cellMetres,
		);
		yield this.step("erosion", true);
	}

	/** The map as it stands, with anything not yet computed holding zero. */
	private step(stage: CoarseStage, done: boolean): CoarseMapStep {
		const empty = new Float32Array(this.grid.count);
		return {
			stage,
			done,
			map: new CoarseMap(
				this.seed,
				this.grid,
				Float32Array.from(this.height ?? empty),
			),
		};
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
