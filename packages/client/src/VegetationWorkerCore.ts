import type { BenchSheet } from "./BenchMessage.js";
import type {
	PlantSheet,
	PlantTally,
	VegetationGeometry,
	VegetationReady,
	VegetationRequest,
	VegetationStep,
} from "./VegetationMessage.js";
import type { Carved, ColumnPatch } from "chamfer/mesh";
import type { PlantLayer, Stand } from "chamfer/generation";
import { BenchWorld } from "./BenchWorld.js";
import { PlanetSettings } from "./PlanetSettings.js";
import { Vec3 } from "chamfer/math";
import {
	CARVE_LAYER_DEFAULT,
	carveSeed,
	growStand,
	layerNoiseSettings,
	makeBlend,
	octaveNoise,
	plantLayerNoise,
	plantRoots,
	plantSalt,
	readBlend,
	standPieces,
	standWalkable,
} from "chamfer/generation";
import {
	columnPatchLayout,
	columnPatchMesh,
	columnSpans,
	plainSpan,
} from "chamfer/mesh";
import { patchField, patchFrame } from "./patchField.js";
import { plantLayerOf } from "./PlantDraft.js";
import { positionOf } from "chamfer/coordinates";

/** How many pixels across the flat planet is drawn. */
const PLANET_WIDE = 512;

/** How many points across the patch is sampled for its own picture. */
const PATCH_SAMPLES = 385;

/**
 * How wide a layer's own picture is.
 *
 * Its own resolution rather than the ground picture's: there is one of these
 * per layer and its whole job is to say where a field's shapes are and how wide
 * they are, which a quarter of the samples answers as well.
 */
const SHOT_WIDE = 512;
const SHOT_PATCH = 320;

/** How many bins the histogram behind a curve is cut into. */
const TALLY_BINS = 48;

/**
 * How many places on the planet the histogram counts.
 *
 * Spread by the golden angle, which puts them at an even density over the whole
 * sphere with no ring, no pole and no lattice to correlate with a field.
 */
const TALLY_SAMPLES = 12000;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * How many cells across the patch is cut into chunks, and how far past its own
 * rim a chunk looks, in metres.
 *
 * **Not knobs, because per-chunk generation is not an option.** A chunk gets an
 * address and the seed and nothing else, so a plant whose canopy crosses a
 * boundary is grown twice, identically, by two chunks that never speak -- and a
 * switch would suggest the other way were also on offer. The reach has to cover
 * the widest canopy: at 24 m the same ground cut up and generated whole came
 * out 0 cells different, at 16 m 0, at 8 m 704 and at none 10,702.
 */
const CHUNK_CELLS = 48;
const CHUNK_REACH = 24;

/**
 * Everything the vegetation bench draws, built where the drawing is not.
 *
 * The map, the patch, the plants and the mesh all happen here; what crosses
 * back is what a picture is made of. Nothing in this file mentions `Worker` or
 * `postMessage`, so it is tested rather than only exercised.
 *
 * **Steps are yielded rather than returned together.** A caller between two of
 * them can hand the event loop back, which is the only place a request that has
 * been superseded can be dropped: a stage runs to its end once started.
 */
export class VegetationWorkerCore {
	private readonly world = new BenchWorld();

	/** Where the patch was laid out, and what came of it. */
	private patchKey = "";
	private layout: ColumnPatch | null = null;

	/** Which world the last sent planet sheet was of, so an unmoved one is not resent. */
	private planetKey = "";

	/**
	 * The layer pictures, held between builds.
	 *
	 * **A layer's field answers to its own noise rows and to nothing else**, so
	 * dragging a trunk radius, adding a second species or moving a curve
	 * re-reads a field that has not changed -- a hundred thousand samples per
	 * layer for the same numbers. Keyed by the rectangle being drawn and by the
	 * rows the field is made of.
	 *
	 * These are copied into the reply rather than moved, which is what lets
	 * them be kept: a transferred buffer is gone from here.
	 */
	private shotKey = "";
	private shotDirs = new Float64Array(0);
	private shotMetres: Float32Array<ArrayBuffer> = new Float32Array(0);
	private shotWide = 0;
	private shotTall = 0;
	private readonly shotOf = new Map<
		number,
		{ readonly key: string; readonly noise: Float32Array<ArrayBuffer> }
	>();

	*steps(
		request: VegetationRequest,
	): Generator<VegetationStep | VegetationReady> {
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
		const fields = this.world.stacks;
		if (!grid || !fields || this.world.height.length === 0) return;
		const k = settings.knobs;
		const seed = settings.seedNumber;
		const radius = settings.radius;
		const level = settings.plantLevel;
		const block = settings.plantCellMetres;
		const frame = patchFrame(k.patchLatitude, k.patchLongitude);

		// **The patch is laid out when it moves and filled when the ground
		// does.** Where it stands and how finely it is cut decide which columns
		// it holds; what stands in them is every other knob.
		const wanted = JSON.stringify([
			k.patchLatitude,
			k.patchLongitude,
			request.blocks,
			level,
		]);
		if (wanted !== this.patchKey || !this.layout) {
			this.patchKey = wanted;
			yield {
				kind: "step",
				token: request.token,
				says: "cutting the patch",
				done: 0,
			};
			this.layout = columnPatchLayout({
				at: frame.up,
				level,
				rings: Math.max(1, request.blocks >> 1),
			});
		}
		const layout = this.layout;

		yield {
			kind: "step",
			token: request.token,
			says: "walking the columns",
			done: 0,
		};
		const ground = this.columns(settings, layout);

		yield {
			kind: "step",
			token: request.token,
			says: "growing the plants",
			done: 0,
		};
		// **The roots are at the finest lattice whatever is drawn**, so the same
		// ground holds the same plants however coarsely it is drawn.
		const roots = plantRoots(
			frame.up,
			settings.depth,
			Math.max(1, request.blocks >> 1),
		);
		// **The ground at a root's own point, not at the column it is drawn
		// on.** A coarse level resamples the surface, so a shore read off the
		// drawn cell moves a metre or two every level and plants at the
		// waterline come and go with it.
		const rootHeight = new Float64Array(roots.count);
		const blend = makeBlend();
		for (let r = 0; r < roots.count; r++) {
			grid.blendInto(
				new Vec3(
					roots.directions[r * 3]!,
					roots.directions[r * 3 + 1]!,
					roots.directions[r * 3 + 2]!,
				),
				blend,
			);
			rootHeight[r] = readBlend(this.world.height, blend);
		}

		const layers: PlantLayer[] = request.layers.map(plantLayerOf);
		const live = layers.filter((layer) => layer.on);
		const stand = growStand(
			layout,
			{ top: ground.top, groundLayer: ground.groundLayer },
			roots,
			rootHeight,
			layers,
			{
				seed,
				radius,
				blockMetres: block,
				rootLevel: settings.depth,
				chunkCells: CHUNK_CELLS,
				chunkReach: CHUNK_REACH,
				seaLevel: 0,
			},
		);

		yield {
			kind: "step",
			token: request.token,
			says: "building the mesh",
			done: 0,
		};
		const mesh = columnPatchMesh(
			layout,
			ground.column,
			{
				radius,
				seaLevel: 0,
				seed,
				speckle: k.patchSpeckle,
				blockMetres: block,
				occlusion: k.patchOcclusion,
			},
			{
				stand,
				top: ground.top,
				groundLayer: ground.groundLayer,
			},
		);

		const pieces = standPieces(layout, ground.groundLayer, stand);
		const walkable = standWalkable(
			stand,
			ground.column.height,
			block,
			0,
			k.leavesCollide,
		);

		const field = patchField(
			grid,
			{
				height: this.world.height,
				raw: this.world.raw,
				continent: fields.continent,
				erosion: fields.erosion,
				peaks: fields.peaks,
			},
			{
				frame,
				span: request.blocks * block,
				across: PATCH_SAMPLES,
				radius,
				carve: null,
			},
		);

		const planetKey = String(this.world.ms);
		let planet: BenchSheet | null = null;
		if (planetKey !== this.planetKey) {
			this.planetKey = planetKey;
			planet = this.planet();
		}

		const shots = this.shots(settings, live, frame, request.blocks * block);
		const tallies = this.tallies(settings, live);

		const geometry: VegetationGeometry = {
			vertices: mesh.vertices,
			lines: mesh.lines,
			groundVertices: mesh.groundVertices,
			plantVertices: mesh.plantVertices,
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
				roots: roots.count,
				columnMetres: block,
				span: mesh.span,
				ms: performance.now() - started,
				bands: this.world.bands,
				summit: this.world.summit,
				floor: this.world.floor,
				land: this.world.land,
				lowest: mesh.lowest,
				highest: mesh.highest,
				landShare: mesh.landShare,
				plants: stand.plants,
				wood: stand.wood,
				leaf: stand.leaf,
				pieces: pieces.pieces,
				rooted: pieces.rooted,
				tallest: stand.tallest,
				shortest: stand.shortest,
				widest: stand.widest,
				chunks: stand.chunks,
				rootsTested: stand.rootsTested,
				rootsOwned: stand.rootsOwned,
				walkable,
				grown: live.map((layer, at) => ({
					id: layer.id,
					count: stand.grown[at] ?? 0,
				})),
			},
			patch: this.patchSheet(field),
			planet,
			sheets: shots.sheets,
			shot: shots.shot,
			tallies,
			geometry,
		};
	}

	/**
	 * Every column of the patch walked, and the mesh's own inputs poured into
	 * what it found.
	 *
	 * The map is read the way the world reads it -- one blend of the three map
	 * samples around each column's direction -- so the ground here is the
	 * ground the world would build there.
	 */
	private columns(
		settings: PlanetSettings,
		layout: ColumnPatch,
	): {
		column: Parameters<typeof columnPatchMesh>[1];
		top: Float64Array;
		groundLayer: Int32Array;
	} {
		const grid = this.world.cells!;
		const terrain = settings.terrainOptions();
		const carve = terrain.carve ?? CARVE_LAYER_DEFAULT;
		const radius = settings.radius;
		const block = settings.plantCellMetres;
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
		const top = new Float64Array(count);
		const groundLayer = new Int32Array(count);
		const runs: number[] = [];
		const all: number[] = [];
		const carved: Carved = { under: 0, above: 0, drowned: 0 };

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
			let rock: number;
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
				rock = runs.length > 0 ? runs[runs.length - 1]! : base;
			} else {
				rock = plainSpan(base, block, carve, runs);
				for (const y of runs) all.push(y);
			}
			height[c] = rock;
			// **The top of the topmost rock, on the block grid the mesh cut
			// it on.** A plant's foot and every slot above it are counted from
			// this, so it is taken from the spans rather than worked out a
			// second time from the surface.
			top[c] = rock;
			groundLayer[c] = Math.round(rock / block) - 1;
		}
		at[count] = all.length;

		return {
			column: {
				at,
				spans: Float64Array.from(all),
				height,
				raw,
				continent,
				erosion,
				peaks,
				carve: carveOf,
			},
			top,
			groundLayer,
		};
	}

	/**
	 * One picture per layer, over whichever rectangle is being shown.
	 *
	 * **A layer's picture is its own noise, not what its curve made of it.** The
	 * curve has a graph directly above the picture, so drawing what it returned
	 * says the same thing twice -- and a curve cannot be drawn against a picture
	 * the curve has already been applied to. The panel reads it through the
	 * curve itself when the density picture is asked for.
	 */
	private shots(
		settings: PlanetSettings,
		live: readonly PlantLayer[],
		frame: ReturnType<typeof patchFrame>,
		span: number,
	): { sheets: PlantSheet[]; shot: PlantSheet } {
		const planet = settings.knobs.patchMap === "planet";
		const wide = planet ? SHOT_WIDE : SHOT_PATCH;
		const tall = planet ? SHOT_WIDE / 2 : SHOT_PATCH;
		const count = wide * tall;
		const grid = this.world.cells!;
		const seed = settings.seedNumber;
		const radius = settings.radius;

		// The directions every picture is read at, taken once and shared: the
		// ground under them is the same ground whichever layer is asking.
		const where = JSON.stringify([
			planet,
			wide,
			settings.knobs.patchLatitude,
			settings.knobs.patchLongitude,
			Math.round(span),
			radius,
			this.world.ms,
		]);
		if (where !== this.shotKey) {
			this.shotKey = where;
			this.shotOf.clear();
			this.shotWide = wide;
			this.shotTall = tall;
			this.shotDirs = new Float64Array(count * 3);
			this.shotMetres = new Float32Array(count);
			const blend = makeBlend();
			for (let r = 0; r < tall; r++)
				for (let q = 0; q < wide; q++) {
					const at = r * wide + q;
					let dir: Vec3;
					if (planet) {
						const latitude = (0.5 - (r + 0.5) / tall) * 180;
						const longitude = ((q + 0.5) / wide) * 360 - 180;
						dir = positionOf(
							{ latitude, longitude, altitude: 0 },
							1,
						);
					} else {
						// North is up on a picture, and the patch is read from
						// its south edge outward.
						const east = ((q + 0.5) / wide - 0.5) * span;
						const north = (0.5 - (r + 0.5) / tall) * span;
						dir = frame.up
							.scale(radius)
							.add(frame.east.scale(east))
							.add(frame.north.scale(north))
							.normalize();
					}
					this.shotDirs[at * 3] = dir.x;
					this.shotDirs[at * 3 + 1] = dir.y;
					this.shotDirs[at * 3 + 2] = dir.z;
					grid.blendInto(dir, blend);
					this.shotMetres[at] = readBlend(this.world.height, blend);
				}
		}

		const sheets = live.map((layer) => {
			const key = JSON.stringify([
				where,
				seed,
				layer.id,
				layer.feature,
				layer.featureScale,
				layer.octaves,
				layer.persistence,
				layer.lacunarity,
				layer.fold,
			]);
			const held = this.shotOf.get(layer.id);
			if (held?.key === key)
				return {
					id: layer.id,
					width: wide,
					height: tall,
					noise: held.noise,
				};
			const settingsOf = plantLayerNoise(layer, radius);
			const salt = (seed + plantSalt(layer.id)) | 0;
			const noise = new Float32Array(count) as Float32Array<ArrayBuffer>;
			// The directions are the ones the rectangle was laid out with,
			// whether that happened this build or an earlier one: what has
			// changed is the field read at them.
			const dirs = this.shotDirs;
			for (let at = 0; at < count; at++)
				noise[at] = octaveNoise(
					dirs[at * 3]!,
					dirs[at * 3 + 1]!,
					dirs[at * 3 + 2]!,
					salt,
					settingsOf,
				);
			this.shotOf.set(layer.id, { key, noise });
			return { id: layer.id, width: wide, height: tall, noise };
		});
		return {
			sheets,
			shot: {
				id: 0,
				width: this.shotWide,
				height: this.shotTall,
				noise: this.shotMetres,
			},
		};
	}

	/**
	 * How much of the planet's land reads each value of each layer's field.
	 *
	 * **Over the land alone**, because a vegetation curve is read on land and
	 * nowhere else and the sea is most of a planet with continents on it.
	 */
	private tallies(
		settings: PlanetSettings,
		live: readonly PlantLayer[],
	): PlantTally[] {
		const grid = this.world.cells!;
		const seed = settings.seedNumber;
		const radius = settings.radius;
		const blend = makeBlend();
		const dry: number[] = [];
		for (let n = 0; n < TALLY_SAMPLES; n++) {
			const z = 1 - (2 * n + 1) / TALLY_SAMPLES;
			const ring = Math.sqrt(Math.max(0, 1 - z * z));
			const a = n * GOLDEN;
			const dir = new Vec3(Math.cos(a) * ring, z, Math.sin(a) * ring);
			grid.blendInto(dir, blend);
			if (readBlend(this.world.height, blend) <= 0) continue;
			dry.push(dir.x, dir.y, dir.z);
		}
		const land = dry.length / 3;
		return live.map((layer) => {
			const settingsOf = plantLayerNoise(layer, radius);
			const salt = (seed + plantSalt(layer.id)) | 0;
			const counts = new Float32Array(TALLY_BINS);
			let tallest = 0;
			for (let n = 0; n < land; n++) {
				const value = octaveNoise(
					dry[n * 3]!,
					dry[n * 3 + 1]!,
					dry[n * 3 + 2]!,
					salt,
					settingsOf,
				);
				const bin = Math.max(
					0,
					Math.min(
						TALLY_BINS - 1,
						Math.floor(((value + 1) / 2) * TALLY_BINS),
					),
				);
				counts[bin]!++;
				if (counts[bin]! > tallest) tallest = counts[bin]!;
			}
			return {
				id: layer.id,
				counts: counts as Float32Array<ArrayBuffer>,
				tallest,
				land,
			};
		});
	}

	/** The buffers a reply carries, so the caller hands them over rather than copies. */
	transfers(reply: VegetationReady): ArrayBuffer[] {
		const out: ArrayBuffer[] = [];
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
		// **The layer pictures are copied rather than moved.** They are held
		// between builds so a field nobody changed is not read again, and a
		// transferred buffer is gone from the side that sent it.
		for (const tally of reply.tallies) out.push(tally.counts.buffer);
		if (reply.geometry) {
			out.push(reply.geometry.vertices.buffer);
			if (reply.geometry.lines) out.push(reply.geometry.lines.buffer);
		}
		return out;
	}

	/** The patch, one sample a pixel, with north turned to the top. */
	private patchSheet(field: ReturnType<typeof patchField>): BenchSheet {
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
			}
		return {
			...sheet,
			rawLow: field.rawLow,
			rawHigh: field.rawHigh,
			low: field.lowest,
			high: field.highest,
		};
	}

	/** The whole planet, longitude across and latitude down. */
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
			}
		}
		return {
			...sheet,
			rawLow,
			rawHigh,
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
