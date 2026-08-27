import type { CoarseStage, LayerNoise } from "chamfer/generation";
import type { PlanetSettings } from "./PlanetSettings.js";
import { bandOf } from "./paintPatch.js";
import {
	CoarseGrid,
	DROPLET,
	erodeDroplets,
	erodeFreeDroplets,
	layerNoise,
	seedFromString,
	shapeLayers,
} from "chamfer/generation";

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

	/**
	 * Each layer's octave stack, before any curve is read off it.
	 *
	 * **A curve is dragged and a noise field is not.** The stacks answer to the
	 * seed, the layer widths and the octave counts alone, and on the shipped
	 * level-8 map they are `410 ms` of an `840 ms` rebuild -- so a curve drag,
	 * which changes no noise whatever, was paying half its cost to compute the
	 * same numbers again. Held here at `10.5 MB` against the grid's own 31 MB.
	 */
	private noiseKey = "";
	private noise: LayerNoise | null = null;

	/** The field with no unit, and what each layer's curve returned. */
	private shapeKey = "";

	/**
	 * The field as the metre step takes it, and as the pictures read it.
	 *
	 * **The metre step is fed the same `float64` the engine feeds it.** Sea
	 * level is a percentile of this field and the scale divides by its peak, so
	 * rounding it to `float32` first and rounding back -- which is what reading
	 * the picture's own copy did -- built a world a few last bits away from the
	 * one the engine builds from the same knobs. The `float32` copy is for
	 * looking at.
	 */
	private wide: Float64Array = new Float64Array(0);
	raw: Float32Array<ArrayBuffer> = new Float32Array(0);

	/** What each layer's curve returned at each cell, for its own picture. */
	continent: Float32Array<ArrayBuffer> = new Float32Array(0);
	erosion: Float32Array<ArrayBuffer> = new Float32Array(0);
	peaks: Float32Array<ArrayBuffer> = new Float32Array(0);

	/** The ground in metres, before erosion and after it. */
	private metreKey = "";
	private uneroded: Float64Array = new Float64Array(0);
	height: Float32Array<ArrayBuffer> = new Float32Array(0);

	/** Metres erosion moved the ground, or nothing when the water is off. */
	delta: Float32Array<ArrayBuffer> | null = null;

	private cutKey = "";
	private buildingKey = "";

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

	/** The tallest and the deepest ground on the planet, in metres from the sea. */
	summit = 0;
	floor = 0;

	/**
	 * How much of the planet stands above sea level, `0` to `1`.
	 *
	 * **A measurement and not a knob.** The coast is where the continentalness
	 * curve crosses its own middle, so the land share falls out of that curve
	 * and is read back off the finished field. A property of the shape stage,
	 * because no metre knob moves it.
	 */
	land = 0;

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
			this.noiseKey = "";
			this.shapeKey = "";
			this.metreKey = "";
			this.cutKey = "";
		}
		const grid = this.grid!;
		const seed = seedFromString(settings.knobs.seed);

		if (keys.noise !== this.noiseKey) {
			// The engine's own pass, in one call: nothing waits on it, because
			// this is a worker and the thread that draws is elsewhere.
			yield say("height", "raising the ground", 0);
			this.noise = layerNoise(grid, seed, options);
			this.noiseKey = keys.noise;
			this.shapeKey = "";
		}

		if (keys.shape !== this.shapeKey) {
			yield say("height", "reading the curves", 0.5);
			// **The curves and the metres are one pass now.** The height comes
			// out in metres here rather than being scaled into them
			// afterwards, because the continentalness curve's middle is the
			// waterline -- so there is no percentile to find and no peak to
			// divide by, and the stage that used to do both is gone.
			const field = shapeLayers(this.noise!, options);
			this.wide = field.raw;
			this.raw = Float32Array.from(field.raw);
			this.continent = field.continent as Float32Array<ArrayBuffer>;
			this.erosion = field.erosion as Float32Array<ArrayBuffer>;
			this.peaks = field.peaks as Float32Array<ArrayBuffer>;
			this.land = field.land;
			this.shapeKey = keys.shape;
			this.metreKey = "";
		}

		if (keys.metres !== this.metreKey) {
			this.uneroded = this.wide;
			this.metreKey = keys.metres;
			this.cutKey = "";
		}

		// **The droplet walk is off the map build.** Erosion in this model is a
		// field read through a curve, one lookup a cell in the pass above; the
		// walk that moved material downhill over a finished map is a different
		// thing that shared its name, and no knob reaches it any more.
		this.height = Float32Array.from(this.uneroded);
		this.delta = null;
		this.report = null;
		this.cutKey = keys.cut;
		this.progress = null;
		this.ms = performance.now() - started;
		this.countBands();
	}

	/** Count the four materials over the planet, and find its tallest ground. */
	private countBands(): void {
		const counts = [0, 0, 0, 0];
		let summit = -Infinity;
		let floor = Infinity;
		const height = this.height.length ? this.height : this.uneroded;
		for (let cell = 0; cell < height.length; cell++) {
			const m = height[cell]!;
			if (m > summit) summit = m;
			if (m < floor) floor = m;
			counts[bandOf(m)]!++;
		}
		const total = Math.max(1, height.length);
		this.bands = counts.map((c) => c / total);
		this.summit = Number.isFinite(summit) ? summit : 0;
		this.floor = Number.isFinite(floor) ? floor : 0;
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
		noise: string;
		shape: string;
		metres: string;
		cut: string;
	} {
		const o = settings.coarseOptions();
		// **A layer's width and its octave count, never its curve.** These four
		// are every number `layerNoiseSettings` reads; the curves are the whole
		// of what the stage after this one takes, which is what makes dragging
		// one cheap.
		// **A layer's stack, never its curve.** Everything here is a number
		// `layerNoiseSettings` reads; the curves and every metre knob are the
		// whole of what the stage after this one takes, which is what makes
		// dragging one cheap.
		const stack = (layer: (typeof o)["continent"]): unknown => [
			layer!.metres,
			layer!.octaves,
			layer!.persistence,
			layer!.lacunarity,
			layer!.fold,
		];
		const noise = JSON.stringify([
			settings.knobs.seed,
			o.level,
			o.cellMetres,
			stack(o.continent),
			stack(o.erosion),
			stack(o.peaks),
		]);
		const shape = JSON.stringify([
			noise,
			o.continent!.curve,
			o.erosion!.curve,
			o.peaks!.curve,
			o.continentLayer,
			o.erosionLayer,
			o.peaksLayer,
			o.erosionBite,
			o.relief,
			o.seaDepth,
			o.peakRelief,
			o.seaLevel,
		]);
		return { noise, shape, metres: shape, cut: shape };
	}
}
