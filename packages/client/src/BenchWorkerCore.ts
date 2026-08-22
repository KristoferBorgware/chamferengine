import type {
	BenchGeometry,
	BenchReady,
	BenchRequest,
	BenchSections,
	BenchStep,
} from "./BenchMessage.js";
import { BenchWorld } from "./BenchWorld.js";
import { PlanetSettings } from "./PlanetSettings.js";
import { coarsePatchMesh } from "chamfer/mesh";
import { paintPatch } from "./paintPatch.js";
import { patchField, patchFrame } from "./patchField.js";
import { positionOf } from "chamfer/coordinates";

/** How many pixels across the flat planet is drawn. */
const PLANET_WIDE = 256;

/**
 * Everything the bench draws, built where the drawing is not.
 *
 * **The thread that draws holds no map, no grid and no field.** A level-8 grid
 * is 31 MB of directions and rings, the noise pass over it is most of a second,
 * and the droplet pass is ten times that; all three happen here, and what
 * crosses back is what a picture is made of -- a mesh, a row of heights, and a
 * rectangle of pixels. The buffers are moved rather than copied, so a patch of
 * seven megabytes costs a pointer.
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

	/** What the last finished build drew, so an unmoved patch is not rebuilt. */
	private patchKey = "";

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
		if (!grid || !this.world.fit) return;
		const k = settings.knobs;
		const frame = patchFrame(k.patchLatitude, k.patchLongitude);
		const layer =
			k.patchPicture === "mountain"
				? this.world.mountain
				: this.world.terrain;

		const field = patchField(
			grid,
			{
				height: this.world.height,
				raw: this.world.raw,
				layer,
				cut: this.world.delta,
			},
			{
				frame,
				cells: k.patchCells,
				step: settings.coarseCell,
				radius: settings.radius,
			},
		);

		// The mesh is rebuilt when the ground under it moved or the patch did,
		// and never when only the picture changed: a picture is a uniform.
		const wanted = JSON.stringify([
			this.world.ms,
			k.patchLatitude,
			k.patchLongitude,
			k.patchCells,
			k.patchLift,
			k.patchPicture === "mountain" ? "mountain" : "terrain",
		]);
		let geometry: BenchGeometry | null = null;
		let cellsDrawn = 0;
		let span = field.span;
		if (wanted !== this.patchKey) {
			this.patchKey = wanted;
			yield {
				kind: "step",
				token: request.token,
				says: "cutting the patch",
				done: 0,
			};
			const patch = coarsePatchMesh(grid, {
				at: frame.up,
				cells: k.patchCells,
				radius: settings.radius,
				exaggeration: k.patchLift,
				height: this.world.height,
				raw: this.world.raw,
				layer,
			});
			geometry = {
				vertices: patch.vertices,
				indices: patch.indices,
				lines: patch.lines,
				triangleCount: patch.triangleCount,
				rawLow: patch.rawLow,
				rawHigh: patch.rawHigh,
			};
			cellsDrawn = patch.cellCount;
			span = patch.span;
		}

		const picture =
			k.patchMap === "planet"
				? this.planet(settings, field.span)
				: this.patch(field, settings);

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
				report: this.world.report,
				span,
				lowest: field.lowest,
				highest: field.highest,
				landShare: field.landShare,
			},
			picture,
			geometry,
			sections,
		};
	}

	/** The buffers a reply carries, so the caller can hand them over rather than copy. */
	transfers(reply: BenchReady): ArrayBuffer[] {
		const out: ArrayBuffer[] = [
			reply.picture.pixels.buffer,
			reply.sections.height.buffer,
		];
		if (reply.geometry)
			out.push(
				reply.geometry.vertices.buffer,
				reply.geometry.indices.buffer,
				reply.geometry.lines.buffer,
			);
		return out;
	}

	/** The patch, one pixel a sampled point. */
	private patch(
		field: ReturnType<typeof patchField>,
		settings: PlanetSettings,
	): BenchReady["picture"] {
		const n = field.across - 1;
		const pixels = new Uint8ClampedArray(n * n * 4);
		const cutScale = this.world.report?.scale ?? 1;
		for (let r = 0; r < n; r++)
			for (let q = 0; q < n; q++) {
				const from = r * field.across + q;
				paintPatch(pixels, ((n - 1 - r) * n + q) * 4, {
					metres: field.height[from]!,
					raw: field.raw[from]!,
					layer: field.layer[from]!,
					cut: field.cut[from]!,
					cutScale,
					rawLow: field.rawLow,
					rawHigh: field.rawHigh,
					picture: settings.knobs.patchPicture,
					contours: settings.knobs.patchContours,
				});
			}
		return { width: n, height: n, pixels };
	}

	/**
	 * The whole planet, longitude across and latitude down.
	 *
	 * The one projection where a pixel's direction is a latitude and a longitude
	 * and no case analysis. It stretches the poles, and it is a picture of where
	 * things are rather than a map anything is measured off.
	 */
	private planet(
		settings: PlanetSettings,
		patchSpan: number,
	): BenchReady["picture"] {
		const grid = this.world.cells!;
		const wide = PLANET_WIDE;
		const tall = wide / 2;
		const pixels = new Uint8ClampedArray(wide * tall * 4);
		const k = settings.knobs;
		const layer =
			k.patchPicture === "mountain"
				? this.world.mountain
				: this.world.terrain;
		const cutScale = this.world.report?.scale ?? 1;
		let rawLow = Infinity;
		let rawHigh = -Infinity;
		for (const v of this.world.raw) {
			if (v < rawLow) rawLow = v;
			if (v > rawHigh) rawHigh = v;
		}
		for (let r = 0; r < tall; r++) {
			const latitude = (0.5 - (r + 0.5) / tall) * 180;
			for (let q = 0; q < wide; q++) {
				const longitude = ((q + 0.5) / wide) * 360 - 180;
				const dir = positionOf({ latitude, longitude, altitude: 0 }, 1);
				paintPatch(pixels, (r * wide + q) * 4, {
					metres: grid.sampleAt(this.world.height, dir),
					raw: grid.sampleAt(this.world.raw, dir),
					layer: grid.sampleAt(layer, dir),
					cut: this.world.delta
						? grid.sampleAt(this.world.delta, dir)
						: 0,
					cutScale,
					rawLow,
					rawHigh,
					picture: k.patchPicture,
					contours: k.patchContours,
				});
			}
		}
		this.outline(pixels, wide, tall, settings, patchSpan);
		return { width: wide, height: tall, pixels };
	}

	/** Where the patch is standing, so the two pictures are one place. */
	private outline(
		pixels: Uint8ClampedArray,
		wide: number,
		tall: number,
		settings: PlanetSettings,
		patchSpan: number,
	): void {
		const k = settings.knobs;
		const half = patchSpan / 2 / settings.radius;
		const lat = (k.patchLatitude * Math.PI) / 180;
		const across = half / Math.max(0.15, Math.cos(lat));
		const left = Math.round(
			((k.patchLongitude + 180) / 360) * wide -
				(across / (2 * Math.PI)) * wide,
		);
		const top = Math.round(
			(0.5 - k.patchLatitude / 180) * tall - (half / Math.PI) * tall,
		);
		const width = Math.max(
			2,
			Math.round(((across * 2) / (2 * Math.PI)) * wide),
		);
		const height = Math.max(2, Math.round(((half * 2) / Math.PI) * tall));
		const dot = (x: number, y: number): void => {
			if (x < 0 || y < 0 || x >= wide || y >= tall) return;
			const at = (y * wide + x) * 4;
			pixels[at] = 255;
			pixels[at + 1] = 180;
			pixels[at + 2] = 84;
			pixels[at + 3] = 255;
		};
		for (let x = left; x <= left + width; x++) {
			dot(x, top);
			dot(x, top + height);
		}
		for (let y = top; y <= top + height; y++) {
			dot(left, y);
			dot(left + width, y);
		}
	}
}
