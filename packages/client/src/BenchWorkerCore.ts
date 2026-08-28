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
import { PATCH_SAMPLES, patchField, patchFrame } from "./patchField.js";
import { patchSheet } from "./patchSheet.js";
import { planetSheet } from "./planetSheet.js";
import { makeBlend, readBlend } from "chamfer/generation";
import { positionOf } from "chamfer/coordinates";
import { Vec3 } from "chamfer/math";

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
		// **Every knob the mesh bakes belongs in this key**, not only the ones
		// that move a block. The speckle and the corner shading are multiplied
		// into a vertex colour and no shader can divide one back out, so a
		// mesh kept across a change to either is a mesh drawn with the setting
		// the reader has just turned off -- which reads as a switch that does
		// nothing at all. The speckle was in exactly that state.
		const groundKey = `${this.world.ms}/${JSON.stringify(
			settings.terrainOptions(),
		)}/${settings.knobs.blockSize}/${settings.knobs.patchSpeckle}/${
			settings.knobs.patchOcclusion
		}`;
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
				bounds: mesh.bounds,
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
			planet = planetSheet(this.world);
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
			patch: patchSheet(field),
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
		// **Where the map put the ground, which is not the top of the rock.**
		// The colours read a block's depth under its own surface, and under an
		// overhang the two are metres apart.
		const surface = new Float64Array(count);
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
			surface[c] = base;
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
					0,
					terrain.carveHold,
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
			surface,
			raw,
			continent,
			erosion,
			peaks,
			carve: carveOf,
		};
		return {
			mesh: columnPatchMesh(layout, ground, {
				radius,
				seaLevel: 0,
				// The world's own seed and the world's own switch, at the
				// bench's own amount.
				seed: settings.seedNumber,
				speckle: settings.knobs.patchSpeckle,
				blockMetres: block,
				occlusion: settings.knobs.patchOcclusion,
			}),
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
}
