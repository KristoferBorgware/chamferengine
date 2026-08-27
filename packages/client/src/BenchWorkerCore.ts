import type {
	BenchGeometry,
	BenchReady,
	BenchRequest,
	BenchSections,
	BenchSheet,
	BenchStep,
} from "./BenchMessage.js";
import { BenchWorld } from "./BenchWorld.js";
import { PlanetSettings } from "./PlanetSettings.js";
import type { Carved, ColumnPatch } from "chamfer/mesh";
import {
	columnPatchLayout,
	columnPatchMesh,
	columnSpans,
	floatingRock,
	plainSpan,
} from "chamfer/mesh";
import {
	CARVE_LAYER_DEFAULT,
	carveSeed,
	layerNoiseSettings,
	octaveNoise,
	splineAt,
} from "chamfer/generation";
import { patchField, patchFrame } from "./patchField.js";
import { makeBlend, readBlend } from "chamfer/generation";
import { positionOf } from "chamfer/coordinates";
import { Vec3 } from "chamfer/math";

/** How many pixels across the flat planet is drawn. */
const PLANET_WIDE = 512;

/**
 * How many points across the patch is sampled for its pictures.
 *
 * **A picture's resolution is its own, not the mesh's.** The patch is cut into
 * columns and how many of those there are is a knob about the *world* -- how
 * finely it is built -- while how finely it is *drawn flat* decides only
 * whether the narrow octaves of a folded field read as a grain or as ridges.
 * Tying the two put a 33-pixel thumbnail under every curve at the default
 * patch.
 *
 * Wide enough that enlarging one to fill the window still shows samples rather
 * than a blur: the thumbnail, the small map and the enlarged picture are all
 * this one rectangle, so it answers to the largest of the three.
 */
const PATCH_SAMPLES = 385;

/**
 * Everything the bench draws, built where the drawing is not.
 *
 * **The thread that draws holds no map, no grid and no field.** A level-8 grid
 * is 31 MB of directions and rings, the noise pass over it is most of a second,
 * and the droplet pass is ten times that; all three happen here, and what
 * crosses back is what a picture is made of -- a mesh, a row of heights, and
 * two rectangles of samples. The buffers are moved rather than copied, so a
 * patch of seven megabytes costs a pointer.
 *
 * **Samples cross back rather than pixels, and that is what makes a picture
 * free.** Which picture is drawn is chosen while looking at the last one, so a
 * round trip to a worker for it would be a choice made and then waited for.
 * Every picture is a colour per sample of the same five fields, so the fields
 * cross once and the thread that draws paints whichever is asked for.
 *
 * Nothing in this file mentions `Worker` or `postMessage`, so it is tested
 * rather than only exercised. The browser half is the file that receives a
 * message, drives this, and posts what it yields.
 *
 * **Steps are yielded rather than returned together.** A caller between two of
 * them can hand the event loop back, which is the only place a request that has
 * been superseded can be dropped: a stage runs to its end once started.
 */
export class BenchWorkerCore {
	private readonly world = new BenchWorld();

	/**
	 * Where the patch was laid out, and what came of it.
	 *
	 * **Two keys, because a patch has two halves.** Where it stands decides
	 * which cells it holds and where their corners sit; what stands on them
	 * decides four floats a vertex. A knob that moves the ground -- which on
	 * this page is nearly all of them -- keeps the first and runs the second.
	 */
	private patchKey = "";
	private layout: ColumnPatch | null = null;
	private groundKey = "";
	private cellsDrawn = 0;

	/** Which world the last sent planet sheet was of, so an unmoved one is not resent. */
	private planetKey = "";

	/** What the last column build reached, so an unbuilt reply can repeat it. */
	private span = 0;
	private dug: Carved = { under: 0, above: 0, drowned: 0 };
	private stacks = { stacked: 0, deepest: 1 };
	private hanging = { masses: 0, spans: 0 };
	private reach = { lowest: 0, highest: 0, landShare: 0 };

	*steps(request: BenchRequest): Generator<BenchStep | BenchReady> {
		const settings = new PlanetSettings(request.knobs);
		for (const progress of this.world.build(settings))
			yield {
				kind: "step",
				token: request.token,
				says: progress.says,
				done: progress.done,
			};

		const grid = this.world.cells;
		const fields = this.world.stacks;
		if (!grid || !fields || this.world.height.length === 0) return;
		const k = settings.knobs;
		const frame = patchFrame(k.patchLatitude, k.patchLongitude);

		const field = patchField(
			grid,
			{
				height: this.world.height,
				raw: this.world.raw,
				// **A layer's picture is its own noise, not its curve's output.**
				// The curve has a graph directly above the picture; drawing what
				// it returned says the same thing twice and leaves the field
				// itself -- where its shapes are and how wide they are -- with
				// nothing showing it.
				continent: fields.continent,
				erosion: fields.erosion,
				peaks: fields.peaks,
			},
			{
				frame,
				span: k.patchCells * settings.coarseCell,
				across: PATCH_SAMPLES,
				radius: settings.radius,
				// **A picture of a 3D field has to be read somewhere**, and the
				// surface is where a reader can compare it against the ground it
				// cuts into.
				carve: settings.terrainOptions().carveLayer
					? {
							layer: settings.layerFor("carve"),
							noise: layerNoiseSettings(
								settings.layerFor("carve"),
								settings.radius,
							),
							seed: carveSeed(settings.seedNumber),
						}
					: null,
			},
		);

		// **The patch is laid out when it moves and filled when the ground
		// does.** Where it stands and how fine it is cut decide which columns
		// it holds; what stands in them is every other knob.
		const level = settings.patchLevel;
		const wanted = JSON.stringify([
			k.patchLatitude,
			k.patchLongitude,
			k.patchCells,
			level,
		]);
		let laidOut = false;
		if (wanted !== this.patchKey || !this.layout) {
			this.patchKey = wanted;
			this.groundKey = "";
			yield {
				kind: "step",
				token: request.token,
				says: "cutting the patch",
				done: 0,
			};
			this.layout = columnPatchLayout({
				at: frame.up,
				level,
				// The knob is map cells *across* and the walk's own limit is a
				// **radius**, at the finer lattice the patch is drawn on.
				rings: Math.max(
					1,
					(k.patchCells << (level - settings.coarseLevel)) >> 1,
				),
			});
			this.cellsDrawn = this.layout.count;
			laidOut = true;
		}
		const layout = this.layout;

		let geometry: BenchGeometry | null = null;
		const cellsDrawn = this.cellsDrawn;
		const groundKey = `${this.world.ms}/${JSON.stringify(
			settings.terrainOptions(),
		)}/${settings.knobs.blockSize}`;
		let span = this.span;
		let dug = this.dug;
		let stacks = this.stacks;
		let hanging = this.hanging;
		let reach = this.reach;
		if (laidOut || groundKey !== this.groundKey) {
			this.groundKey = groundKey;
			yield {
				kind: "step",
				token: request.token,
				says: "walking the columns",
				done: 0,
			};
			const built = this.columns(settings, layout);
			const mesh = built.mesh;
			span = this.span = mesh.span;
			dug = this.dug = built.dug;
			stacks = this.stacks = built.stacks;
			hanging = this.hanging = built.hanging;
			reach = this.reach = {
				lowest: mesh.lowest,
				highest: mesh.highest,
				landShare: mesh.landShare,
			};
			geometry = {
				vertices: mesh.vertices,
				// A column mesh shares no vertex, so there is nothing for an
				// index to name: the two runs are named by their lengths.
				indices: null,
				lines: mesh.lines,
				triangleCount: mesh.groundVertices / 3,
				groundVertices: mesh.groundVertices,
				waterVertices: mesh.waterVertices,
				rawLow: mesh.rawLow,
				rawHigh: mesh.rawHigh,
			};
		}

		// The planet sheet is the whole map read at one pixel a place, so it
		// moves when the ground does and not when the patch walks across it.
		// A sent buffer is gone from here, so what stands in for sending it
		// again is sending nothing.
		const planetKey = String(this.world.ms);
		let planet: BenchSheet | null = null;
		if (planetKey !== this.planetKey) {
			this.planetKey = planetKey;
			planet = this.planet();
		}

		const sections: BenchSections = {
			across: field.across,
			step: field.step,
			span: field.span,
			height: field.height as Float32Array<ArrayBuffer>,
			lowest: field.lowest,
			highest: field.highest,
		};

		yield {
			kind: "ready",
			token: request.token,
			facts: {
				cells: grid.count,
				cellsDrawn,
				ms: this.world.ms,
				bands: this.world.bands,
				summit: this.world.summit,
				floor: this.world.floor,
				land: this.world.land,
				span,
				lowest: reach.lowest,
				highest: reach.highest,
				landShare: reach.landShare,
				columnMetres: settings.patchCellMetres,
				whole: layout.whole,
				dugUnder: dug.under,
				dugAbove: dug.above,
				dugDrowned: dug.drowned,
				floating: hanging.masses,
				floatingSpans: hanging.spans,
				stacked: stacks.stacked,
				deepest: stacks.deepest,
			},
			patch: this.patch(field),
			planet,
			geometry,
			sections,
		};
	}

	/**
	 * Every column of the patch walked, and the mesh poured into what it found.
	 *
	 * **The map is read the way the world reads it** -- one blend of the three
	 * map samples around each column's direction -- so the ground here is the
	 * ground the world would build there, and not a second evaluation of the
	 * noise that would agree with it only approximately.
	 *
	 * The carve is the expensive half: a block a step down as deep as the layer
	 * reaches, once per column. With the layer off no field is read at all and
	 * the column is the height field rounded to the block grid, which is the
	 * terracing the world builds and the shape a carve is cut out of.
	 */
	private columns(
		settings: PlanetSettings,
		layout: ColumnPatch,
	): {
		mesh: ReturnType<typeof columnPatchMesh>;
		dug: Carved;
		stacks: { stacked: number; deepest: number };
		hanging: { masses: number; spans: number };
	} {
		const grid = this.world.cells!;
		const terrain = settings.terrainOptions();
		// `terrainOptions` always fills it; the type has it optional because the
		// engine's own default stands in for a caller that leaves it out.
		const carve = terrain.carve ?? CARVE_LAYER_DEFAULT;
		const radius = settings.radius;
		const block = settings.knobs.blockSize;
		const carveNoise = layerNoiseSettings(carve, radius);
		const seed = carveSeed(settings.seedNumber);

		const count = layout.count;
		const at = new Int32Array(count + 1);
		const height = new Float64Array(count);
		const raw = new Float32Array(count);
		const continent = new Float32Array(count);
		const erosion = new Float32Array(count);
		const peaks = new Float32Array(count);
		const carveOf = new Float32Array(count);
		const runs: number[] = [];
		const all: number[] = [];
		const dug: Carved = { under: 0, above: 0, drowned: 0 };
		const carved: Carved = { under: 0, above: 0, drowned: 0 };
		let stacked = 0;
		let deepest = 1;

		const blend = makeBlend();
		for (let c = 0; c < count; c++) {
			// A `Vec3` a column rather than one refilled: it is immutable, and
			// an allocation here is one per column against a walk of hundreds of
			// blocks inside it.
			const dir = new Vec3(
				layout.directions[c * 3]!,
				layout.directions[c * 3 + 1]!,
				layout.directions[c * 3 + 2]!,
			);
			grid.blendInto(dir, blend);
			const base = readBlend(this.world.height, blend);
			raw[c] = readBlend(this.world.raw, blend);
			continent[c] = readBlend(this.world.continent, blend);
			erosion[c] = readBlend(this.world.erosion, blend);
			peaks[c] = readBlend(this.world.peaks, blend);

			at[c] = all.length;
			let top: number;
			if (terrain.carveLayer) {
				columnSpans(
					dir.x,
					dir.y,
					dir.z,
					base,
					radius,
					block,
					seed,
					carve,
					carveNoise,
					runs,
					carved,
				);
				for (const y of runs) all.push(y);
				// **The height a colour and a coastline read is the top of the
				// topmost rock**, which under an overhang is not the surface the
				// three fields drew, and under a column carved away entirely is
				// nothing at all.
				top = runs.length > 0 ? runs[runs.length - 1]! : base;
				dug.under += carved.under;
				dug.above += carved.above;
				dug.drowned += carved.drowned;
				if (runs.length > 2) stacked++;
				if (runs.length / 2 > deepest) deepest = runs.length / 2;
			} else {
				top = plainSpan(base, block, carve, runs);
				for (const y of runs) all.push(y);
			}
			height[c] = top;
			// **Read at the top of the rock**, which is where a reader can
			// compare it against the shape it cut. Off, the channel is there
			// and says nothing.
			if (terrain.carveLayer) {
				const out = 1 + top / radius;
				carveOf[c] = octaveNoise(
					dir.x * out,
					dir.y * out,
					dir.z * out,
					seed,
					carveNoise,
				);
			}
		}
		at[count] = all.length;

		const ground = {
			at,
			spans: Float64Array.from(all),
			height,
			raw,
			continent,
			erosion,
			peaks,
			carve: carveOf,
		};
		return {
			mesh: columnPatchMesh(layout, ground, { radius, seaLevel: 0 }),
			dug,
			stacks: { stacked, deepest },
			hanging: floatingRock(layout, ground, block),
		};
	}

	/** The buffers a reply carries, so the caller can hand them over rather than copy. */
	transfers(reply: BenchReady): ArrayBuffer[] {
		const out: ArrayBuffer[] = [reply.sections.height.buffer];
		for (const sheet of [reply.patch, reply.planet])
			if (sheet)
				out.push(
					sheet.metres.buffer,
					sheet.raw.buffer,
					sheet.continent.buffer,
					sheet.erosion.buffer,
					sheet.peaks.buffer,
					sheet.carve.buffer,
				);
		if (reply.geometry) {
			out.push(reply.geometry.vertices.buffer);
			if (reply.geometry.indices) out.push(reply.geometry.indices.buffer);
			if (reply.geometry.lines) out.push(reply.geometry.lines.buffer);
		}
		return out;
	}

	/**
	 * The patch, one sample a pixel.
	 *
	 * The rows are turned over here rather than where they are painted: north
	 * is up on a picture and the field is read from the south edge outward, and
	 * a picture that is drawn six ways should be flipped once.
	 */
	private patch(field: ReturnType<typeof patchField>): BenchSheet {
		const n = field.across - 1;
		const sheet = this.sheet(n, n);
		for (let r = 0; r < n; r++)
			for (let q = 0; q < n; q++) {
				const from = r * field.across + q;
				const to = (n - 1 - r) * n + q;
				sheet.metres[to] = field.height[from]!;
				sheet.raw[to] = field.raw[from]!;
				sheet.continent[to] = field.continent[from]!;
				sheet.erosion[to] = field.erosion[from]!;
				sheet.peaks[to] = field.peaks[from]!;
				sheet.carve[to] = field.carve[from]!;
			}
		return {
			...sheet,
			rawLow: field.rawLow,
			rawHigh: field.rawHigh,
			low: field.lowest,
			high: field.highest,
		};
	}

	/**
	 * The whole planet, longitude across and latitude down.
	 *
	 * The one projection where a pixel's direction is a latitude and a longitude
	 * and no case analysis. It stretches the poles, and it is a picture of where
	 * things are rather than a map anything is measured off.
	 */
	private planet(): BenchSheet {
		const grid = this.world.cells!;
		const layers = this.world.stacks!;
		const wide = PLANET_WIDE;
		const tall = wide / 2;
		const sheet = this.sheet(wide, tall);
		let rawLow = Infinity;
		let rawHigh = -Infinity;
		for (const v of this.world.raw) {
			if (v < rawLow) rawLow = v;
			if (v > rawHigh) rawHigh = v;
		}
		// One lookup a pixel, five fields read off it.
		const blend = makeBlend();
		for (let r = 0; r < tall; r++) {
			const latitude = (0.5 - (r + 0.5) / tall) * 180;
			for (let q = 0; q < wide; q++) {
				const longitude = ((q + 0.5) / wide) * 360 - 180;
				const dir = positionOf({ latitude, longitude, altitude: 0 }, 1);
				const at = r * wide + q;
				grid.blendInto(dir, blend);
				sheet.metres[at] = readBlend(this.world.height, blend);
				sheet.raw[at] = readBlend(this.world.raw, blend);
				sheet.continent[at] = readBlend(layers.continent, blend);
				sheet.erosion[at] = readBlend(layers.erosion, blend);
				sheet.peaks[at] = readBlend(layers.peaks, blend);
				// **No carve on the planet picture.** It is one pixel a place
				// over the whole world, where the layer's shapes are 120 m
				// across -- a picture of it at that scale is noise.
			}
		}
		return {
			...sheet,
			rawLow,
			rawHigh,
			// The whole planet's own range, because this picture is of the
			// whole planet: a patch's ends would blow out everything taller.
			low: this.world.floor,
			high: this.world.summit,
		};
	}

	/** Five empty fields of one size, which is what every picture is drawn from. */
	private sheet(
		width: number,
		height: number,
	): Omit<BenchSheet, "rawLow" | "rawHigh" | "low" | "high"> {
		const count = width * height;
		return {
			width,
			height,
			metres: new Float32Array(count),
			raw: new Float32Array(count),
			continent: new Float32Array(count),
			erosion: new Float32Array(count),
			peaks: new Float32Array(count),
			carve: new Float32Array(count),
		};
	}
}
