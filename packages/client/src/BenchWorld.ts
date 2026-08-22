import type { CoarseStage } from "chamfer/generation";
import type { PlanetSettings } from "./PlanetSettings.js";
import { bandOf } from "./paintPatch.js";
import {
	CoarseGrid,
	DROPLET,
	erodeDroplets,
	erodeFreeDroplets,
	layeredHeight,
	metreHeight,
	seaLevelFor,
	seedFromString,
} from "chamfer/generation";

/** What the metre step read off the field, held so the pictures can use it. */
export interface MetreFit {
	/** The height that leaves the asked-for land above it. */
	readonly sea: number;

	/** What a unit of field above and below that is worth in metres. */
	readonly up: number;
	readonly down: number;

	/** Metres the whole field was lifted by draining the sea. */
	readonly drained: number;
}

/** What one erosion run did, in the numbers a carving pass is judged by. */
export interface ErosionReport {
	readonly droplets: number;

	/** Metres of cut the picture saturates at. */
	readonly scale: number;

	readonly before: Slopes;
	readonly after: Slopes;

	/** Metres the ground moved, per cell, and the deepest single cut. */
	readonly moved: number;
	readonly deepest: number;

	readonly ms: number;
}

/** Three percentiles of how steep the land is, in metres of fall per metre. */
export interface Slopes {
	readonly median: number;
	readonly ninety: number;
	readonly ninetyNine: number;
}

/** What a stage of the build is doing, for a line the reader can watch. */
export interface BenchProgress {
	readonly stage: CoarseStage | "grid";
	readonly says: string;
	readonly done: number;
}

/** How many droplets one slice of the erosion pass runs before it reports. */
const DROPLET_SLICE = 40000;

/**
 * The planet's map, built for the bench and held between redraws.
 *
 * **The same grid the engine builds, at the same level.** Two things the bench
 * shows are not properties of a point: the metre scale divides the field by its
 * own tallest value, which is a maximum over the whole planet, and water walks
 * from cell to cell. Both are read off these cells, so the numbers on the bench
 * are the numbers the world is built from.
 *
 * Three stages, held apart because they are rebuilt at different rates. The
 * grid depends on the level alone; the field depends on every knob that decides
 * the shape of the ground; the cutting depends on the erosion rows. Each runs
 * in slices with a wait between them, so the panel stays live while a level-8
 * planet -- 655,362 cells, and 983,043 droplets if the water is on -- is built.
 */
export class BenchWorld {
	private grid: CoarseGrid | null = null;
	private level = -1;

	/** The field with no unit, and what each layer's curve returned. */
	private shapeKey = "";
	raw: Float32Array<ArrayBuffer> = new Float32Array(0);
	terrain: Float32Array<ArrayBuffer> = new Float32Array(0);
	mountain: Float32Array<ArrayBuffer> = new Float32Array(0);

	/** The ground in metres, before erosion and after it. */
	private metreKey = "";
	private uneroded: Float64Array = new Float64Array(0);
	height: Float32Array<ArrayBuffer> = new Float32Array(0);

	/** Metres erosion moved the ground, or nothing when the water is off. */
	delta: Float32Array<ArrayBuffer> | null = null;

	private cutKey = "";
	private buildingKey = "";

	/** What the metre step read, or nothing before a build has finished one. */
	fit: MetreFit | null = null;

	/** What the last erosion run did, or nothing when the water is off. */
	report: ErosionReport | null = null;

	/** What the build is doing now, or nothing when it is not running. */
	progress: BenchProgress | null = null;

	/** How long the last whole build took, in milliseconds. */
	ms = 0;

	/**
	 * What the whole planet is made of, as a share of its cells.
	 *
	 * **The planet, not the patch.** The material lines are absolute metres and
	 * Relief is what carries the ground up through them, so the share of each
	 * is a property of the world -- and a patch is a place, which can be all
	 * mountain or all sea whatever the planet is doing.
	 */
	bands: readonly number[] = [0, 0, 0, 0];

	/** The tallest ground on the planet, in metres above sea level. */
	summit = 0;

	/**
	 * How much of the planet stands above the mountain line, `0` to `1`.
	 *
	 * A property of the shape stage, so it survives an erosion run: what the
	 * gate lets through is decided before a single droplet falls.
	 */
	overLine = 0;

	/** The grid the fields are indexed by, once there is one. */
	get cells(): CoarseGrid | null {
		return this.grid;
	}

	/**
	 * Bring the map up to date, yielding what each stage is doing.
	 *
	 * Nothing is yielded at all when the world already matches, which is what
	 * makes moving the patch or changing a picture cost no map work.
	 */
	*build(settings: PlanetSettings): Generator<BenchProgress> {
		const options = settings.coarseOptions();
		const keys = this.keysOf(settings);
		if (keys.cut === this.cutKey) return;
		this.buildingKey = keys.cut;
		const started = performance.now();
		const say = (
			stage: BenchProgress["stage"],
			says: string,
			done: number,
		): BenchProgress => {
			this.progress = { stage, says, done };
			return this.progress;
		};

		const level = options.level ?? 8;
		if (this.level !== level) {
			yield say("grid", "numbering the planet", 0);
			this.grid = new CoarseGrid(level);
			this.level = level;
			// Every field below is one value per cell of the grid it was
			// computed on, so all of them go with the grid.
			this.shapeKey = "";
			this.metreKey = "";
			this.cutKey = "";
			this.fit = null;
		}
		const grid = this.grid!;
		const seed = seedFromString(settings.knobs.seed);

		if (keys.shape !== this.shapeKey) {
			// The whole field in one call, because it is the engine's own pass
			// and splitting it would be a second copy of it. Nothing waits on
			// it: this is a worker, and the thread that draws is elsewhere.
			yield say("height", "raising the ground", 0);
			const field = layeredHeight(grid, seed, options);
			this.raw = Float32Array.from(field.raw);
			this.terrain = field.terrain as Float32Array<ArrayBuffer>;
			this.mountain = field.mountain as Float32Array<ArrayBuffer>;
			this.overLine = field.overLine;
			this.shapeKey = keys.shape;
			this.metreKey = "";
		}

		if (keys.metres !== this.metreKey) {
			yield say("metres", "filling the sea", 0);
			// **Sea level is a percentile and the scale is a maximum**, and
			// both are read over the cells the world is built from. A few
			// thousand directions find the percentile and miss the maximum --
			// an extreme is the largest of whatever was looked at.
			const raw = Float64Array.from(this.raw);
			this.uneroded = metreHeight(raw, {
				landFraction: options.landFraction!,
				relief: options.relief!,
				seaDepth: options.seaDepth!,
				seaLevel: options.seaLevel!,
			});
			const sea = seaLevelFor(raw, options.landFraction!);
			let peak = 0;
			let trough = 0;
			for (const v of raw) {
				const d = v - sea;
				if (d > peak) peak = d;
				if (d < trough) trough = d;
			}
			this.fit = {
				sea,
				up: peak > 0 ? options.relief! / peak : 0,
				down: trough < 0 ? options.seaDepth! / -trough : 0,
				drained: -options.seaLevel!,
			};
			this.metreKey = keys.metres;
			this.cutKey = "";
		}

		const strength = options.erosion ?? 0;
		if (strength <= 0) {
			this.height = Float32Array.from(this.uneroded);
			this.delta = null;
			this.report = null;
			this.cutKey = keys.cut;
			this.progress = null;
			this.ms = performance.now() - started;
			this.countBands();
			return;
		}

		const cellMetres = options.cellMetres!;
		const before = this.slopes(this.uneroded, cellMetres);
		const cutting = Float64Array.from(this.uneroded);
		const cut =
			options.erosionWalk === "free" ? erodeFreeDroplets : erodeDroplets;
		const shared = {
			maxCut: options.erosionMaxCut!,
			cutShare: options.erosionCutShare!,
			inertia: options.erosionInertia!,
		};
		const droplets = Math.round(strength * DROPLET.perCell * grid.count);
		for (let from = 0; from < droplets; from += DROPLET_SLICE) {
			cut(grid, cutting, seed, strength, cellMetres, {
				...shared,
				from,
				take: DROPLET_SLICE,
			});
			yield say(
				"erosion",
				"cutting the valleys",
				Math.min(1, (from + DROPLET_SLICE) / droplets),
			);
		}

		let moved = 0;
		let deepest = 0;
		const delta = new Float64Array(grid.count);
		for (let cell = 0; cell < grid.count; cell++) {
			const d = cutting[cell]! - this.uneroded[cell]!;
			delta[cell] = d;
			moved += Math.abs(d);
			if (-d > deepest) deepest = -d;
		}
		// What a picture of the cut saturates at. The deepest single cut is a
		// spike and would leave the rest of the map grey, so this is the reach
		// of all but the loudest fiftieth.
		const sorted = Float64Array.from(delta, Math.abs).sort();
		this.height = Float32Array.from(cutting);
		this.delta = Float32Array.from(delta);
		this.report = {
			droplets,
			scale: Math.max(0.01, sorted[Math.floor(sorted.length * 0.98)]!),
			before,
			after: this.slopes(cutting, cellMetres),
			moved: moved / grid.count,
			deepest,
			ms: performance.now() - started,
		};
		this.cutKey = keys.cut;
		this.progress = null;
		this.ms = performance.now() - started;
		this.countBands();
	}

	/** Count the four materials over the planet, and find its tallest ground. */
	private countBands(): void {
		const counts = [0, 0, 0, 0];
		let summit = -Infinity;
		const height = this.height.length ? this.height : this.uneroded;
		for (let cell = 0; cell < height.length; cell++) {
			const m = height[cell]!;
			if (m > summit) summit = m;
			counts[bandOf(m)]!++;
		}
		const total = Math.max(1, height.length);
		this.bands = counts.map((c) => c / total);
		this.summit = Number.isFinite(summit) ? summit : 0;
	}

	/**
	 * How steep the land is, as three percentiles.
	 *
	 * The steepest of a cell's six neighbours, over land cells only, because
	 * the number this answers is what a hillside does. **A pass that carves
	 * moves the tail and leaves the middle alone**; one whose median climbs
	 * with it is adding roughness everywhere instead.
	 */
	private slopes(height: Float64Array, cellMetres: number): Slopes {
		const grid = this.grid!;
		const out: number[] = [];
		for (let cell = 0; cell < grid.count; cell += 7) {
			if (height[cell]! <= 0) continue;
			let worst = 0;
			for (let k = 0; k < 6; k++) {
				const other = grid.ring[cell * 6 + k]!;
				if (other < 0) continue;
				const fall =
					Math.abs(height[cell]! - height[other]!) / cellMetres;
				if (fall > worst) worst = fall;
			}
			out.push(worst);
		}
		out.sort((a, b) => a - b);
		const at = (p: number): number =>
			out.length === 0
				? 0
				: out[Math.min(out.length - 1, Math.floor(out.length * p))]!;
		return { median: at(0.5), ninety: at(0.9), ninetyNine: at(0.99) };
	}

	/** Which knobs each stage of the build depends on. */
	private keysOf(settings: PlanetSettings): {
		shape: string;
		metres: string;
		cut: string;
	} {
		const o = settings.coarseOptions();
		const shape = JSON.stringify([
			settings.knobs.seed,
			o.level,
			o.cellMetres,
			o.terrain,
			o.mountain,
			o.mountainLayer,
			o.merge,
			o.mountainLine,
			o.detail,
		]);
		const metres = JSON.stringify([
			shape,
			o.landFraction,
			o.relief,
			o.seaDepth,
			o.seaLevel,
		]);
		return {
			shape,
			metres,
			cut: JSON.stringify([
				metres,
				o.erosion,
				o.erosionWalk,
				o.erosionMaxCut,
				o.erosionCutShare,
				o.erosionInertia,
			]),
		};
	}
}
