import type {
	BiomeCloud,
	BiomeSheet,
	BiomesGeometry,
	BiomesReady,
	BiomesRequest,
	BiomesStep,
} from "./BiomesMessage.js";
import type { BiomeDef, BiomeWorld, LandformGrid } from "chamfer/generation";
import type { ColumnPatch } from "chamfer/mesh";
import { BenchWorld } from "./BenchWorld.js";
import { PlanetSettings } from "./PlanetSettings.js";
import { biomeTableFromText } from "./BiomeDraft.js";
import { Vec3 } from "chamfer/math";
import {
	BiomeField,
	LANDFORMS,
	allowedBiomes,
	biomeOf,
	bucket,
	gridAt,
	CONT_EDGES,
	ERO_EDGES,
	PV_EDGES,
	landformAt,
	makeBiomeSample,
	makeBlend,
	readBlend,
} from "chamfer/generation";
import { CARVE_LAYER_DEFAULT } from "chamfer/generation";
import { columnPatchLayout, columnPatchMesh, plainSpan } from "chamfer/mesh";
import { latticePosition, canonicalCell } from "chamfer/addressing";
import { positionOf } from "chamfer/coordinates";

/** How many pixels across the flat planet's readings are sampled. */
const PLANET_WIDE = 448;

/** The lattice level the planet-wide shares are counted over: 10,242 cells. */
const SHARE_LEVEL = 5;

/** Every reading the model takes at a set of directions, held between builds. */
interface HeldSamples {
	readonly metres: Float32Array<ArrayBuffer>;
	readonly level: Float32Array<ArrayBuffer>;
	readonly cut: Float32Array<ArrayBuffer>;
	readonly swing: Float32Array<ArrayBuffer>;
	readonly room: Uint8Array<ArrayBuffer>;
	readonly t: Float32Array<ArrayBuffer>;
	readonly h: Float32Array<ArrayBuffer>;
	readonly pushT: Float32Array<ArrayBuffer>;
	readonly pushH: Float32Array<ArrayBuffer>;
	readonly region: Float64Array<ArrayBuffer>;
}

function heldSamples(count: number): HeldSamples {
	return {
		metres: new Float32Array(count),
		level: new Float32Array(count),
		cut: new Float32Array(count),
		swing: new Float32Array(count),
		room: new Uint8Array(count),
		t: new Float32Array(count),
		h: new Float32Array(count),
		pushT: new Float32Array(count),
		pushH: new Float32Array(count),
		region: new Float64Array(count),
	};
}

/** The directions the planet-wide shares are counted at, the same every world. */
let shareDirections: Float64Array | null = null;

function sharePoints(): Float64Array {
	if (shareDirections) return shareDirections;
	const n = 1 << SHARE_LEVEL;
	const out: number[] = [];
	for (let face = 0; face < 20; face++)
		for (let i = 0; i <= n; i++)
			for (let j = 0; i + j <= n; j++) {
				// A cell on a face edge has several names; the owning face
				// counts it once.
				if (canonicalCell(face, n, i, j).face !== face) continue;
				const p = latticePosition(face, n, i, j);
				out.push(p.x, p.y, p.z);
			}
	shareDirections = Float64Array.from(out);
	return shareDirections;
}

/**
 * Everything the biome bench draws, built where the drawing is not.
 *
 * The map, the biome field, the patch and the planet's readings all happen
 * here; what crosses back is what a picture is made of. Nothing in this file
 * mentions `Worker` or `postMessage`, so it is tested rather than only
 * exercised.
 *
 * **Sampling is held apart from naming.** Everything up to the climate square
 * is a function of the seed and the knobs; the landform grid and the diagram's
 * dots are a table over it. A drag on a dot re-resolves held samples --
 * columns, planet readings and shares alike -- without touching a noise stack,
 * which is what keeps the diagram live under the finger.
 */
export class BiomesWorkerCore {
	private readonly world = new BenchWorld();

	private patchKey = "";
	private layout: ColumnPatch | null = null;

	/** The biome field, keyed by everything its sampling half reads. */
	private fieldKey = "";
	private field: BiomeField | null = null;

	/** The held readings: the patch's columns, the planet sheet, the shares. */
	private columnsKey = "";
	private columns: HeldSamples | null = null;
	private columnGround: {
		at: Int32Array;
		spans: Float64Array;
		height: Float64Array;
		surface: Float64Array;
		raw: Float32Array;
		continent: Float32Array;
		erosion: Float32Array;
		peaks: Float32Array;
		carve: Float32Array;
		material: Uint16Array;
	} | null = null;

	private sheetKey = "";
	private sheet: HeldSamples | null = null;

	private sharesKey = "";
	private shares: HeldSamples | null = null;

	/** What the last sent planet sheet was of, so an unmoved one is not resent. */
	private planetSentKey = "";

	*steps(request: BiomesRequest): Generator<BiomesStep | BiomesReady> {
		const started = performance.now();
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
		const seed = settings.seedNumber;
		const radius = settings.radius;
		const cellMetres = settings.coarseCell;
		const table = biomeTableFromText(k.biomes);
		const allowed = allowedBiomes(table.biomes);

		// **The field is keyed by everything its sampling half reads**, which
		// is every knob except the table and the pictures. The table is what
		// `resolve` reads, and resolution runs fresh on every build.
		const fieldKey = this.samplingKey(settings);
		if (fieldKey !== this.fieldKey || !this.field) {
			yield {
				kind: "step",
				token: request.token,
				says: "measuring the climate",
				done: 0,
			};
			const blend = makeBlend();
			const height = this.world.height;
			const world: BiomeWorld = {
				seed,
				radius,
				continent: settings.layerFor("continent"),
				erosion: settings.layerFor("erosion"),
				peaks: settings.layerFor("peaks"),
				heightAt: (x, y, z) => {
					grid.blendInto(new Vec3(x, y, z), blend);
					return readBlend(height, blend);
				},
			};
			this.field = new BiomeField(
				world,
				table.biomes,
				table.grid,
				settings.biomeOptions(),
			);
			this.fieldKey = fieldKey;
			this.columnsKey = "";
			this.sheetKey = "";
			this.sharesKey = "";
		}
		const field = this.field;

		// Where the patch stands decides which columns it holds.
		const wantedPatch = JSON.stringify([
			k.patchLatitude,
			k.patchLongitude,
			request.cells,
			settings.coarseLevel,
		]);
		if (wantedPatch !== this.patchKey || !this.layout) {
			this.patchKey = wantedPatch;
			this.columnsKey = "";
			yield {
				kind: "step",
				token: request.token,
				says: "cutting the patch",
				done: 0,
			};
			this.layout = columnPatchLayout({
				at: positionOf(
					{
						latitude: k.patchLatitude,
						longitude: k.patchLongitude,
						altitude: 0,
					},
					1,
				),
				level: settings.coarseLevel,
				rings: Math.max(1, request.cells >> 1),
			});
		}
		const layout = this.layout;

		const columnsKey = fieldKey + this.patchKey;
		if (columnsKey !== this.columnsKey || !this.columns) {
			yield {
				kind: "step",
				token: request.token,
				says: "walking the columns",
				done: 0,
			};
			this.columns = this.readColumns(settings, layout, field);
			this.columnsKey = columnsKey;
		}

		const sheetKey = fieldKey;
		if (sheetKey !== this.sheetKey || !this.sheet) {
			yield {
				kind: "step",
				token: request.token,
				says: "reading the planet",
				done: 0,
			};
			this.sheet = this.readSheet(field);
			this.sheetKey = sheetKey;
			this.planetSentKey = "";
		}

		const sharesKey = fieldKey;
		if (sharesKey !== this.sharesKey || !this.shares) {
			yield {
				kind: "step",
				token: request.token,
				says: "counting the shares",
				done: 0,
			};
			this.shares = this.readShares(field);
			this.sharesKey = sharesKey;
		}

		yield {
			kind: "step",
			token: request.token,
			says: "building the mesh",
			done: 0,
		};

		// **Naming runs fresh on every build**, because the table is what a
		// drag edits and everything above is held.
		const columnForm = new Int8Array(layout.count);
		const columnBiome = new Int16Array(layout.count);
		this.resolveHeld(
			this.columns!,
			table,
			allowed,
			columnForm,
			columnBiome,
		);
		const ground = this.columnGround!;
		for (let c = 0; c < layout.count; c++)
			ground.material[c] =
				columnBiome[c]! < 0 ? 0 : table.biomes[columnBiome[c]!]!.block;

		// **The patch's own cloud, sent whole.** A patch is a few thousand
		// hexagons at most, so there is nothing to subsample -- every column
		// draws its own point, the way the lab draws one dot a hexagon.
		const patch: BiomeCloud = {
			t: this.columns!.t.slice(),
			h: this.columns!.h.slice(),
			landform: columnForm.slice() as Int8Array<ArrayBuffer>,
		};

		const mesh = columnPatchMesh(layout, ground, {
			radius,
			seaLevel: 0,
			seed,
			speckle: k.patchSpeckle,
			blockMetres: cellMetres,
			occlusion: k.patchOcclusion,
		});

		// The planet sheet's own naming, and the shares over both rectangles.
		const sheetForm = new Int8Array(this.sheet!.metres.length);
		const sheetBiome = new Int16Array(this.sheet!.metres.length);
		this.resolveHeld(this.sheet!, table, allowed, sheetForm, sheetBiome);
		const shareForm = new Int8Array(this.shares!.metres.length);
		const shareBiome = new Int16Array(this.shares!.metres.length);
		this.resolveHeld(this.shares!, table, allowed, shareForm, shareBiome);

		const planetShares = new Array<number>(table.biomes.length).fill(0);
		const formPlanet = new Array<number>(LANDFORMS.length).fill(0);
		const gridShares = new Array<number>(table.grid.length).fill(0);
		let landCells = 0;
		const held = this.shares!;
		for (let n = 0; n < shareBiome.length; n++) {
			if (shareForm[n]! < 0) continue;
			landCells++;
			formPlanet[shareForm[n]!]!++;
			if (shareBiome[n]! >= 0) planetShares[shareBiome[n]!]!++;
			gridShares[
				gridAt(
					bucket(held.level[n]!, CONT_EDGES),
					bucket(held.cut[n]!, ERO_EDGES),
					bucket(held.swing[n]!, PV_EDGES),
				)
			]!++;
		}
		const patchShares = new Array<number>(table.biomes.length).fill(0);
		const formPatch = new Array<number>(LANDFORMS.length).fill(0);
		const gridPatch = new Array<number>(table.grid.length).fill(0);
		let patchLand = 0;
		const columns = this.columns!;
		for (let c = 0; c < layout.count; c++) {
			if (columnForm[c]! < 0) continue;
			patchLand++;
			formPatch[columnForm[c]!]!++;
			if (columnBiome[c]! >= 0) patchShares[columnBiome[c]!]!++;
			gridPatch[
				gridAt(
					bucket(columns.level[c]!, CONT_EDGES),
					bucket(columns.cut[c]!, ERO_EDGES),
					bucket(columns.swing[c]!, PV_EDGES),
				)
			]!++;
		}
		const over = (counts: number[], total: number): number[] =>
			counts.map((count) => (total > 0 ? count / total : 0));

		// The sheet crosses only when its readings moved, because the block
		// half is cheap to recompute and the field half is megabytes.
		let planet: BiomeSheet | null = null;
		const planetKey = sheetKey + JSON.stringify([k.biomes]);
		if (planetKey !== this.planetSentKey) {
			this.planetSentKey = planetKey;
			const s = this.sheet!;
			const count = s.metres.length;
			const block = new Uint16Array(count);
			for (let n = 0; n < count; n++)
				block[n] =
					sheetBiome[n]! < 0
						? 0
						: table.biomes[sheetBiome[n]!]!.block;
			planet = {
				width: PLANET_WIDE,
				height: PLANET_WIDE / 2,
				block,
				landform: sheetForm as Int8Array<ArrayBuffer>,
				t: s.t.slice(),
				h: s.h.slice(),
				pushT: s.pushT.slice(),
				pushH: s.pushH.slice(),
				region: s.region.slice(),
				metres: s.metres.slice(),
			};
		}

		const geometry: BiomesGeometry = {
			vertices: mesh.vertices,
			lines: mesh.lines,
			groundVertices: mesh.groundVertices,
			waterVertices: mesh.waterVertices,
			bounds: mesh.bounds,
			rawLow: mesh.rawLow,
			rawHigh: mesh.rawHigh,
		};

		yield {
			kind: "ready",
			token: request.token,
			facts: {
				cells: grid.count,
				cellsDrawn: layout.count,
				columnMetres: cellMetres,
				span: mesh.span,
				patchAt: {
					latitude: k.patchLatitude,
					longitude: k.patchLongitude,
					radius: settings.radius,
				},
				ms: performance.now() - started,
				land: this.world.land,
				lowest: mesh.lowest,
				highest: mesh.highest,
				landShare: mesh.landShare,
				planetShares: over(planetShares, landCells),
				patchShares: over(patchShares, patchLand),
				formPlanet: over(formPlanet, landCells),
				formPatch: over(formPatch, patchLand),
				gridShares: over(gridShares, landCells),
				gridPatch: over(gridPatch, patchLand),
				built: planetShares.filter((share) => share > 0).length,
				patchBiomes: patchShares.filter((share) => share > 0).length,
				fit: field.fit,
				regionLevel: field.regionLevel,
				regionMetres: field.regionMetres,
			},
			planet,
			patch,
			geometry,
		};
	}

	/** The buffers a ready reply can move rather than copy. */
	transfers(ready: BiomesReady): Transferable[] {
		const out: Transferable[] = [];
		if (ready.geometry) {
			out.push(ready.geometry.vertices.buffer);
			if (ready.geometry.lines) out.push(ready.geometry.lines.buffer);
		}
		if (ready.planet)
			out.push(
				ready.planet.block.buffer,
				ready.planet.t.buffer,
				ready.planet.h.buffer,
				ready.planet.pushT.buffer,
				ready.planet.pushH.buffer,
				ready.planet.region.buffer,
				ready.planet.metres.buffer,
			);
		out.push(
			ready.patch.t.buffer,
			ready.patch.h.buffer,
			ready.patch.landform.buffer,
		);
		return out;
	}

	/** Everything the field's sampling half reads, as one string. */
	private samplingKey(settings: PlanetSettings): string {
		const {
			biomes: _table,
			patchPicture: _p,
			patchSurface: _s,
			patchMap: _m,
			patchAlong: _a,
			...sampled
		} = settings.knobs;
		return JSON.stringify(sampled);
	}

	/** The table's answer over one set of held readings. */
	private resolveHeld(
		held: HeldSamples,
		table: { biomes: readonly BiomeDef[]; grid: LandformGrid },
		allowed: readonly (readonly number[])[],
		form: Int8Array,
		biome: Int16Array,
	): void {
		const shoreHeight = this.field!.settings.shoreHeight;
		for (let n = 0; n < form.length; n++) {
			const at = landformAt(
				held.level[n]!,
				held.cut[n]!,
				held.swing[n]!,
				held.metres[n]!,
				held.room[n]!,
				shoreHeight,
				table.grid,
			);
			form[n] = at;
			biome[n] =
				at < 0
					? -1
					: biomeOf(
							held.t[n]!,
							held.h[n]!,
							allowed[at],
							table.biomes,
						);
		}
	}

	/** Every reading at a set of directions, packed flat. */
	private sampleInto(
		field: BiomeField,
		directions: ArrayLike<number>,
		count: number,
		held: HeldSamples,
	): void {
		const out = makeBiomeSample();
		for (let n = 0; n < count; n++) {
			field.sampleAt(
				directions[n * 3]!,
				directions[n * 3 + 1]!,
				directions[n * 3 + 2]!,
				out,
			);
			held.metres[n] = out.metres;
			held.level[n] = out.level;
			held.cut[n] = out.cut;
			held.swing[n] = out.swing;
			held.room[n] = out.room;
			held.t[n] = out.t;
			held.h[n] = out.h;
			held.pushT[n] = out.pushT;
			held.pushH[n] = out.pushH;
			held.region[n] = out.region;
		}
	}

	/**
	 * The patch's columns: the model's readings, and the mesh's own inputs.
	 *
	 * The map is read the way the world reads it -- one blend of the three map
	 * samples around each column's direction -- so the ground here is the
	 * ground the world would build there.
	 */
	private readColumns(
		settings: PlanetSettings,
		layout: ColumnPatch,
		field: BiomeField,
	): HeldSamples {
		const grid = this.world.cells!;
		const cellMetres = settings.coarseCell;
		const count = layout.count;
		const held = heldSamples(count);
		this.sampleInto(field, layout.directions, count, held);

		const at = new Int32Array(count + 1);
		const height = new Float64Array(count);
		const surface = new Float64Array(count);
		const raw = new Float32Array(count);
		const continent = new Float32Array(count);
		const erosion = new Float32Array(count);
		const peaks = new Float32Array(count);
		const runs: number[] = [];
		const all: number[] = [];
		const blend = makeBlend();
		for (let c = 0; c < count; c++) {
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
			const rock = plainSpan(base, cellMetres, CARVE_LAYER_DEFAULT, runs);
			for (const y of runs) all.push(y);
			height[c] = rock;
			surface[c] = base;
		}
		at[count] = all.length;

		this.columnGround = {
			at,
			spans: Float64Array.from(all),
			height,
			surface,
			raw,
			continent,
			erosion,
			peaks,
			carve: new Float32Array(count),
			material: new Uint16Array(count),
		};
		return held;
	}

	/** The whole planet's readings, one per pixel of the flat picture. */
	private readSheet(field: BiomeField): HeldSamples {
		const wide = PLANET_WIDE;
		const tall = PLANET_WIDE / 2;
		const count = wide * tall;
		const directions = new Float64Array(count * 3);
		for (let r = 0; r < tall; r++)
			for (let q = 0; q < wide; q++) {
				const dir = positionOf(
					{
						latitude: (0.5 - (r + 0.5) / tall) * 180,
						longitude: ((q + 0.5) / wide) * 360 - 180,
						altitude: 0,
					},
					1,
				);
				const n = (r * wide + q) * 3;
				directions[n] = dir.x;
				directions[n + 1] = dir.y;
				directions[n + 2] = dir.z;
			}
		const held = heldSamples(count);
		this.sampleInto(field, directions, count, held);
		return held;
	}

	/** The planet-wide readings the shares are counted over. */
	private readShares(field: BiomeField): HeldSamples {
		const points = sharePoints();
		const count = points.length / 3;
		const held = heldSamples(count);
		this.sampleInto(field, points, count, held);
		return held;
	}
}
