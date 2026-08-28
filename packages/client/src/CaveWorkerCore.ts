import type { BenchSheet } from "./BenchMessage.js";
import type {
	CaveCells,
	CaveGeometry,
	CavePlanSheet,
	CaveReady,
	CaveRequest,
	CaveStep,
} from "./CaveMessage.js";
import type { CaveCellPlan } from "./caveCellsOf.js";
import type { CaveMeasure } from "./measureCaves.js";
import type { CaveVolume } from "./caveVolume.js";
import type { ColumnGround, ColumnMesh, ColumnPatch } from "chamfer/mesh";
import { BenchWorld } from "./BenchWorld.js";
import { PlanetSettings } from "./PlanetSettings.js";
import { caveCellsOf } from "./caveCellsOf.js";
import { cavePlanField } from "./cavePlanField.js";
import { caveSpans } from "./caveSpans.js";
import { caveVolume } from "./caveVolume.js";
import { columnPatchLayout, columnPatchMesh } from "chamfer/mesh";
import { caveField } from "chamfer/generation";
import { cutPatch } from "./cutPatch.js";
import { PATCH_SAMPLES, patchField, patchFrame } from "./patchField.js";
import { patchSheet } from "./patchSheet.js";
import { planetSheet } from "./planetSheet.js";
import { carveSeed, layerNoiseSettings } from "chamfer/generation";
import { measureCaves } from "./measureCaves.js";

/**
 * Where the sea is put when the caves are being drawn as the solid.
 *
 * **The void has no coastline.** Drawing the world inside out puts the top of a
 * passage where the ground was, and a sheet of water laid over that is a blue
 * lid on a picture of a hole. Below anything the patch holds, so the mesher
 * draws no water at all.
 */
const NO_SEA = -1e9;

/**
 * Everything the cave bench draws, built where the drawing is not.
 *
 * **The thread that draws holds no map, no grid and no volume.** A level-8 grid
 * is 31 MB of directions and rings and the noise pass over it is most of a
 * second; the column walk is one field reading a *block*, which is the largest
 * bill on the page. All of it happens here, and what crosses back is a mesh, a
 * rectangle of samples and a row of counts.
 *
 * **Four keys, because the work comes apart into four pieces that are asked for
 * at different rates.** The map answers to the world's own rows; the patch's
 * layout answers to where it stands and how finely it is cut; the volume
 * answers to the cave rule; the mesh answers to the volume, the cut and which
 * of the two things is being drawn. Moving the cut costs a mesh and no walk;
 * moving the plan's depth costs a raster and neither.
 *
 * Nothing in this file mentions `Worker` or `postMessage`, so it is tested
 * rather than only exercised.
 */
export class CaveWorkerCore {
	private readonly world = new BenchWorld();

	private patchKey = "";
	private layout: ColumnPatch | null = null;
	private cells: CaveCellPlan | null = null;

	private volumeKey = "";
	private volume: CaveVolume | null = null;
	private measured: CaveMeasure | null = null;

	private meshKey = "";
	private meshSpan = 1;
	private meshFacts = {
		triangles: 0,
		lowest: 0,
		highest: 0,
		rawLow: -1,
		rawHigh: 1,
		ms: 0,
	};

	private planKey = "";

	/**
	 * Which world the last flat pictures were of, so an unmoved one is not
	 * resent.
	 *
	 * **A sent buffer is gone from here**, so what stands in for sending one
	 * again is sending nothing and letting the page keep the last.
	 */
	private sheetKey = "";
	private planetKey = "";

	*steps(request: CaveRequest): Generator<CaveStep | CaveReady> {
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

		// **The patch is laid out when it moves and filled when the ground
		// does.** Where it stands and how fine it is cut decide which columns it
		// holds; what stands in them is every other knob.
		const level = settings.patchLevel;
		const wanted = JSON.stringify([
			k.patchLatitude,
			k.patchLongitude,
			k.patchCells,
			level,
		]);
		if (wanted !== this.patchKey || !this.layout) {
			this.patchKey = wanted;
			this.volumeKey = "";
			this.planKey = "";
			yield {
				kind: "step",
				token: request.token,
				says: "cutting the patch",
				done: 0,
			};
			this.layout = columnPatchLayout({
				at: patchFrame(k.patchLatitude, k.patchLongitude).up,
				level,
				// The knob is map cells *across* and the walk's own limit is a
				// **radius**, at the finer lattice the patch is drawn on.
				rings: Math.max(
					1,
					(k.patchCells << (level - settings.coarseLevel)) >> 1,
				),
			});
			this.cells = caveCellsOf(this.layout, settings.radius);
		}
		const layout = this.layout;
		const cells = this.cells!;

		// **Every knob the walk reads belongs in this key.** A block removed is
		// a block no shader can put back, so anything that moves one is a walk.
		const volumeKey = `${this.world.ms}/${JSON.stringify(
			settings.terrainOptions(),
		)}/${k.blockSize}/${k.caveCrust}`;
		if (volumeKey !== this.volumeKey || !this.volume) {
			this.volumeKey = volumeKey;
			this.meshKey = "";
			yield {
				kind: "step",
				token: request.token,
				says: "walking the columns",
				done: 0,
			};
			this.volume = caveVolume(
				layout,
				grid,
				{
					height: this.world.height,
					raw: this.world.raw,
					continent: this.world.continent,
					erosion: this.world.erosion,
					peaks: this.world.peaks,
				},
				settings,
			);
			yield {
				kind: "step",
				token: request.token,
				says: "measuring the void",
				done: 0.5,
			};
			this.measured = measureCaves(layout, this.volume);
		}
		const volume = this.volume;
		const measured = this.measured!;

		// The mesh answers to the volume, to the cut and to which of the two
		// things is drawn -- and to the two baked shading amounts, which are
		// multiplied into a vertex colour that no shader can divide back out.
		const meshKey = `${volumeKey}/${k.caveDraw}/${k.caveCutAcross}/${k.caveCutAlong}/${k.patchSpeckle}/${k.patchOcclusion}`;
		let geometry: CaveGeometry | null = null;
		if (meshKey !== this.meshKey) {
			this.meshKey = meshKey;
			yield {
				kind: "step",
				token: request.token,
				says: "drawing the volume",
				done: 0,
			};
			const started = performance.now();
			const mesh = this.mesh(layout, cells, volume, settings);
			this.meshSpan = mesh.span;
			this.meshFacts = {
				triangles: mesh.groundVertices / 3,
				lowest: mesh.lowest,
				highest: mesh.highest,
				rawLow: mesh.rawLow,
				rawHigh: mesh.rawHigh,
				ms: performance.now() - started,
			};
			geometry = {
				vertices: mesh.vertices,
				lines: mesh.lines,
				triangleCount: mesh.groundVertices / 3,
				groundVertices: mesh.groundVertices,
				waterVertices: mesh.waterVertices,
				bounds: mesh.bounds,
				rawLow: mesh.rawLow,
				rawHigh: mesh.rawHigh,
			};
		}

		// The plan is one slice of the field, so it answers to the depth as well
		// as to everything the field itself answers to.
		const planKey = `${volumeKey}/${k.caveSlice}`;
		let plan: CavePlanSheet | null = null;
		let planCells: CaveCells | null = null;
		if (planKey !== this.planKey) {
			this.planKey = planKey;
			plan = cavePlanField(
				layout,
				cells,
				grid,
				this.world.height,
				settings,
			);
			planCells = this.planCells(layout, cells, volume, settings);
		}

		// **The small map is how a reader stands somewhere else**, and it
		// answers to the world rather than to the caves: the planet moves when
		// the map does and the patch when it walks across it, so a cave knob
		// sends neither.
		const sheetKey = `${this.world.ms}/${k.patchLatitude}/${k.patchLongitude}/${k.patchCells}/${JSON.stringify(settings.terrainOptions())}`;
		let patch: BenchSheet | null = null;
		let planet: BenchSheet | null = null;
		if (sheetKey !== this.sheetKey) {
			this.sheetKey = sheetKey;
			const carve = settings.layerFor("carve");
			patch = patchSheet(
				patchField(
					grid,
					{
						height: this.world.height,
						raw: this.world.raw,
						continent: this.world.stacks!.continent,
						erosion: this.world.stacks!.erosion,
						peaks: this.world.stacks!.peaks,
					},
					{
						frame: patchFrame(k.patchLatitude, k.patchLongitude),
						span: k.patchCells * settings.coarseCell,
						across: PATCH_SAMPLES,
						radius: settings.radius,
						carve: settings.terrainOptions().carveLayer
							? {
									layer: carve,
									noise: layerNoiseSettings(
										carve,
										settings.radius,
									),
									seed: carveSeed(settings.seedNumber),
								}
							: null,
					},
				),
			);
		}
		const planetKey = String(this.world.ms);
		if (planetKey !== this.planetKey) {
			this.planetKey = planetKey;
			planet = planetSheet(this.world);
		}

		yield {
			kind: "ready",
			token: request.token,
			facts: {
				cells: grid.count,
				cellsDrawn: layout.count,
				columnMetres: settings.patchCellMetres,
				whole: layout.whole,
				span: this.meshSpan,
				crust: volume.layers * volume.blockMetres,
				caveCells: measured.caveCells,
				caveColumns: measured.caveColumns,
				medianWidth: measured.medianWidth,
				thinShare: measured.thinShare,
				systems: measured.systems,
				largest: measured.largest,
				half: measured.half,
				mouths: measured.mouths,
				multiSpan: measured.multiSpan,
				faces: measured.faces,
				facesBare: measured.facesBare,
				triangles: this.meshFacts.triangles,
				lookups: layout.count ? volume.lookups / layout.count : 0,
				mapMs: this.world.ms,
				walkMs: volume.ms,
				meshMs: this.meshFacts.ms,
				lowest: this.meshFacts.lowest,
				highest: this.meshFacts.highest,
				land: this.world.land,
				bands: this.world.bands,
				summit: this.world.summit,
				floor: this.world.floor,
			},
			geometry,
			plan,
			cells: planCells,
			patch,
			planet,
		};
	}

	/** The buffers a reply carries, so the caller can hand them over rather than copy. */
	transfers(reply: CaveReady): ArrayBuffer[] {
		const out: ArrayBuffer[] = [];
		if (reply.geometry) {
			out.push(reply.geometry.vertices.buffer);
			if (reply.geometry.lines) out.push(reply.geometry.lines.buffer);
		}
		if (reply.plan)
			out.push(reply.plan.value.buffer, reply.plan.band.buffer);
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
		if (reply.cells)
			out.push(
				reply.cells.at.buffer,
				reply.cells.corners.buffer,
				reply.cells.degree.buffer,
				reply.cells.ring.buffer,
				reply.cells.value.buffer,
				reply.cells.open.buffer,
			);
		return out;
	}

	/**
	 * The volume as triangles, with the far corner taken off it.
	 *
	 * The cut runs before the mesh rather than after, so the faces the removed
	 * columns used to hide are emitted: what a cut has to show is the inside.
	 */
	private mesh(
		layout: ColumnPatch,
		cells: CaveCellPlan,
		volume: CaveVolume,
		settings: PlanetSettings,
	): ColumnMesh {
		const k = settings.knobs;
		const ground = caveSpans(volume, k.caveDraw);
		const cut = cutPatch(layout, cells, k.caveCutAcross, k.caveCutAlong);
		return columnPatchMesh(cut.patch, this.subset(ground, cut.keep), {
			radius: settings.radius,
			seaLevel: k.caveDraw === "void" ? NO_SEA : 0,
			seed: settings.seedNumber,
			speckle: k.patchSpeckle,
			blockMetres: k.blockSize,
			occlusion: k.patchOcclusion,
		});
	}

	/** One ground, kept for the columns a cut left standing. */
	private subset(ground: ColumnGround, keep: Int32Array): ColumnGround {
		const kept = keep.length;
		const at = new Int32Array(kept + 1);
		const runs: number[] = [];
		const height = new Float64Array(kept);
		const surface = new Float64Array(kept);
		const raw = new Float32Array(kept);
		const continent = new Float32Array(kept);
		const erosion = new Float32Array(kept);
		const peaks = new Float32Array(kept);
		const carve = new Float32Array(kept);
		for (let n = 0; n < kept; n++) {
			const c = keep[n]!;
			at[n] = runs.length;
			for (let pair = ground.at[c]!; pair < ground.at[c + 1]!; pair++)
				runs.push(ground.spans[pair]!);
			height[n] = ground.height[c]!;
			surface[n] = ground.surface[c]!;
			raw[n] = ground.raw[c]!;
			continent[n] = ground.continent[c]!;
			erosion[n] = ground.erosion[c]!;
			peaks[n] = ground.peaks[c]!;
			carve[n] = ground.carve[c]!;
		}
		at[kept] = runs.length;
		return {
			at,
			spans: Float64Array.from(runs),
			height,
			surface,
			raw,
			continent,
			erosion,
			peaks,
			carve,
		};
	}

	/**
	 * The lattice the plan draws, with each cell's own reading on it.
	 *
	 * **The hexagons are what the world is built out of**, and the raster beside
	 * them is a picture of the field. Where the two part company is where the
	 * lattice cannot draw what the field says, which is the one thing a plan of
	 * a cave has to answer.
	 */
	private planCells(
		patch: ColumnPatch,
		cells: CaveCellPlan,
		volume: CaveVolume,
		settings: PlanetSettings,
	): CaveCells {
		const count = cells.count;
		const value = new Float32Array(count);
		const open = new Float32Array(count);
		const threshold = settings.knobs.caveThreshold;
		const slice = settings.knobs.caveSlice;
		const radius = settings.radius;
		const seed = settings.seedNumber;
		const scale = settings.knobs.caveScale;
		for (let c = 0; c < count; c++) {
			const ground = volume.surface[c]!;
			const v = caveField(
				patch.directions[c * 3]!,
				patch.directions[c * 3 + 1]!,
				patch.directions[c * 3 + 2]!,
				radius + ground - slice,
				seed,
				scale,
			);
			value[c] = v;
			const band = slice >= volume.ceiling[c]! ? threshold : 0;
			// **Bright at the spine and falling off to the rim**, which is the
			// same quantity a roof height would be taken from -- so the picture
			// reads as a passage with a shape rather than as a stencil.
			open[c] = band > 0 ? Math.max(0, (band - Math.abs(v)) / band) : 0;
		}
		return {
			count,
			at: cells.at,
			corners: cells.corners,
			degree: cells.degree,
			ring: cells.ring,
			value,
			open,
			low: cells.low,
			high: cells.high,
		};
	}
}
