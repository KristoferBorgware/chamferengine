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
import type { PatchLayout } from "chamfer/mesh";
import { patchLayout, patchVertices } from "chamfer/mesh";
import { patchField, patchFrame } from "./patchField.js";
import { makeBlend, readBlend } from "chamfer/generation";
import { positionOf } from "chamfer/coordinates";

/** How many pixels across the flat planet is drawn. */
const PLANET_WIDE = 256;

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
	private layout: PatchLayout | null = null;
	private groundKey = "";
	private cellsDrawn = 0;

	/** Which world the last sent planet sheet was of, so an unmoved one is not resent. */
	private planetKey = "";

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
		if (!grid || this.world.height.length === 0) return;
		const k = settings.knobs;
		const frame = patchFrame(k.patchLatitude, k.patchLongitude);

		const field = patchField(
			grid,
			{
				height: this.world.height,
				raw: this.world.raw,
				terrain: this.world.terrain,
				mountain: this.world.mountain,
				cut: this.world.delta,
			},
			{
				frame,
				cells: k.patchCells,
				step: settings.coarseCell,
				radius: settings.radius,
			},
		);

		// **The patch is laid out when it moves and filled when the ground
		// does.** Neither is a picture: both control layers ride on the vertex,
		// so choosing one is a uniform and reaches none of this.
		const place = {
			at: frame.up,
			cells: k.patchCells,
			radius: settings.radius,
		};
		const wanted = JSON.stringify([
			k.patchLatitude,
			k.patchLongitude,
			k.patchCells,
			settings.radius,
			settings.coarseLevel,
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
			this.layout = patchLayout(grid, place);
			this.cellsDrawn = this.layout.cellCount;
			laidOut = true;
		}
		const layout = this.layout;

		let geometry: BenchGeometry | null = null;
		const cellsDrawn = this.cellsDrawn;
		const span = layout.span;
		if (laidOut || String(this.world.ms) !== this.groundKey) {
			this.groundKey = String(this.world.ms);
			const fill = patchVertices(layout, {
				height: this.world.height,
				raw: this.world.raw,
				terrain: this.world.terrain,
				mountain: this.world.mountain,
			});
			geometry = {
				vertices: fill.vertices,
				// **Copied, because a sent buffer is a gone buffer.** The
				// layout is kept here and handing its own arrays over would
				// detach them; this is paid when the patch moves and never
				// while the ground does.
				indices: laidOut ? Uint32Array.from(layout.indices) : null,
				lines: laidOut ? Uint32Array.from(layout.lines) : null,
				triangleCount: layout.triangleCount,
				rawLow: fill.rawLow,
				rawHigh: fill.rawHigh,
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
				report: this.world.report,
				overLine: this.world.overLine,
				span,
				lowest: field.lowest,
				highest: field.highest,
				landShare: field.landShare,
			},
			patch: this.patch(field),
			planet,
			geometry,
			sections,
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
					sheet.terrain.buffer,
					sheet.mountain.buffer,
					sheet.cut.buffer,
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
				sheet.terrain[to] = field.terrain[from]!;
				sheet.mountain[to] = field.mountain[from]!;
				sheet.cut[to] = field.cut[from]!;
			}
		return {
			...sheet,
			rawLow: field.rawLow,
			rawHigh: field.rawHigh,
			low: field.lowest,
			high: field.highest,
			cutScale: this.world.report?.scale ?? 1,
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
				sheet.terrain[at] = readBlend(this.world.terrain, blend);
				sheet.mountain[at] = readBlend(this.world.mountain, blend);
				if (this.world.delta)
					sheet.cut[at] = readBlend(this.world.delta, blend);
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
			cutScale: this.world.report?.scale ?? 1,
		};
	}

	/** Five empty fields of one size, which is what every picture is drawn from. */
	private sheet(
		width: number,
		height: number,
	): Omit<BenchSheet, "rawLow" | "rawHigh" | "low" | "high" | "cutScale"> {
		const count = width * height;
		return {
			width,
			height,
			metres: new Float32Array(count),
			raw: new Float32Array(count),
			terrain: new Float32Array(count),
			mountain: new Float32Array(count),
			cut: new Float32Array(count),
		};
	}
}
