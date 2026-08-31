import type { Column } from "../../generation/chunk/Column.js";
import type { GridParts } from "../GridPaint.js";
import type {
	MeshJob,
	MeshResult,
	MeshRetune,
	MeshWorkerSetup,
} from "./MeshJob.js";
import { BlockType } from "../../generation/terrain/BlockType.js";
import { Chunk } from "../../generation/chunk/Chunk.js";
import { ChunkDeltas } from "../../edit/ChunkDeltas.js";
import { ChunkAddress } from "../../generation/chunk/ChunkAddress.js";
import { ChunkColumnSampler } from "../../generation/chunk/ChunkColumnSampler.js";
import { CoarseMap } from "../../generation/coarse/CoarseMap.js";
import { CAVE_DETAIL_REACH } from "../CAVE_DETAIL_REACH.js";
import { CUTOUT_REACH } from "../CUTOUT_REACH.js";
import { SPECKLE } from "../../generation/terrain/blockColor.js";
import { TerrainGenerator } from "../../generation/terrain/TerrainGenerator.js";
import { WorldShape } from "../../world/WorldShape.js";
import { BiomeField } from "../../generation/biomes/BiomeField.js";
import { biomeWorldFor } from "../../generation/biomes/biomeWorldFor.js";
import { buildChunkMesh } from "../buildChunkMesh.js";
import { applyDeltas } from "../../generation/chunk/applyDeltas.js";
import type { PlantLayer } from "../../generation/plants/PlantLayer.js";
import { generateChunk } from "../../generation/chunk/generateChunk.js";
import { plantChunk } from "../../generation/chunk/plantChunk.js";
import { PlantTemplateStore } from "../../generation/plants/PlantTemplateStore.js";

/**
 * The working half of a mesh worker, with no reference to `Worker`, `self` or
 * `postMessage`.
 *
 * A worker script is then four lines: make one of these on setup, call
 * {@link run} on each job, post what it returns. Everything worth testing runs
 * under plain Node, and the part that needs a browser holds no logic.
 *
 * Generation and meshing are one job here. Splitting them puts 478 KB of blocks
 * on the wire per chunk and leaves the meshing on the thread that draws.
 */
export class MeshWorkerCore {
	private readonly shape: WorldShape;
	private readonly map: CoarseMap;
	private readonly seed: number;
	private readonly apron: boolean;
	private readonly debugSeams: boolean;

	// The three a {@link retune} replaces. They are baked into a vertex colour
	// and read nothing else, so changing one needs the meshes again and needs
	// the map, the shape and the generators exactly as they are.
	private speckle: number;
	private textureLayers: Int32Array | null;
	private ambientOcclusion: boolean;
	private skyExposure: boolean;
	private cutoutLeaves: boolean;
	private readonly options: MeshWorkerSetup["terrain"];

	/**
	 * One generator per level, made when a level is first asked for.
	 *
	 * A chunk one level coarser samples the terrain at twice the spacing over
	 * four times the area, so it holds the same slots and there are four times
	 * fewer of them.
	 */
	private readonly byLod = new Map<number, TerrainGenerator>();

	/**
	 * One set of pre-grown plants per level of detail, built on first use.
	 *
	 * **Rasterising a plant is nine tenths of what one costs**, so every level
	 * grows a handful properly and stamps the rest. A set is a pure function of
	 * the seed, the species and the level, so every worker builds the same one
	 * without a byte crossing between them.
	 */
	private readonly templatesByLod = new Map<number, PlantTemplateStore>();

	/**
	 * Every kind of plant this world grows.
	 *
	 * Held for the worker's life beside the map, because a forest is part of
	 * the world's definition rather than of any one chunk.
	 */
	private readonly plants: readonly PlantLayer[];

	/** The grid switches, and the one flat column every grid cell reads. */
	private readonly grid: GridParts | null;
	private readonly flat: Column | null;

	/**
	 * The world's biome table, read once for its whole life.
	 *
	 * **Shared across every LOD, built at the finest.** A biome names a place
	 * rather than a mesh resolution -- the same identity a region or a
	 * climate reading already carries -- so one field built against the
	 * worker's own base shape answers for every level a chunk is drawn at,
	 * and building it again per level would only repeat its own land-wide
	 * fit measurement for no different answer.
	 */
	private readonly biomeField: BiomeField | null;

	constructor(setup: MeshWorkerSetup) {
		this.map = CoarseMap.fromSnapshot(setup.map);
		this.shape = new WorldShape(
			setup.seaLevelRadius,
			setup.subdivisionDepth,
			setup.maxElevation,
			setup.crustDepth,
		);
		this.seed = setup.map.seed;
		this.apron = setup.apron;
		this.debugSeams = setup.debugSeams ?? false;
		this.speckle = setup.speckle ?? SPECKLE;
		this.textureLayers = setup.textureLayers ?? null;
		this.ambientOcclusion = setup.ambientOcclusion ?? true;
		this.skyExposure = setup.skyExposure ?? true;
		this.cutoutLeaves = setup.cutoutLeaves ?? true;
		this.options = setup.terrain;
		this.plants = setup.plants ?? [];
		this.grid = setup.grid ?? null;
		this.biomeField = setup.biomes
			? new BiomeField(
					biomeWorldFor(
						this.seed,
						this.shape,
						this.map,
						setup.biomes.continent,
						setup.biomes.erosion,
						setup.biomes.peaks,
					),
					setup.biomes.biomes,
					setup.biomes.grid,
					setup.biomes.settings,
				)
			: null;
		// Two solid layers, so the top cap is the only face a cell has: the
		// layer under the surface is solid too, and a bottom face is only
		// emitted over air. Every column of every chunk is this one object --
		// the shell is the same everywhere, which is the point of it.
		const blocks = new Uint16Array(2).fill(BlockType.STONE);
		this.flat = this.grid
			? {
					blocks,
					first: 0,
					last: -1,
					groundRadius: this.shape.crustTopRadius,
					waterRadius: 0,
				}
			: null;
	}

	/**
	 * Change the switches baked into a vertex colour, keeping everything else.
	 *
	 * The map, the shape, the seed and the per-level generators are what a
	 * setup is expensive for, and not one of them is a function of these
	 * three. Every chunk still has to be built again, because what they
	 * change is already multiplied into the colours of the ones that exist.
	 */
	retune(message: MeshRetune): void {
		this.speckle = message.speckle;
		this.ambientOcclusion = message.ambientOcclusion;
		this.skyExposure = message.skyExposure;
		this.cutoutLeaves = message.cutoutLeaves;
	}

	run(job: MeshJob): MeshResult {
		const shape = this.shape.atLod(job.lod);
		const chunk =
			this.grid && this.flat
				? this.flatChunk(job, shape)
				: generateChunk(
						this.generator(job.lod),
						ChunkAddress.fromKey(job.key, job.chunkLevel),
						job.chunkLevel,
						shape.crustDepth,
					);
		// **The plants are grown before anything a player changed is applied**,
		// so a broken branch stays broken: a delta is the record of what
		// somebody did to the world the seed makes, and the world the seed
		// makes has trees in it.
		// **Every level grows plants, and only the finest sends its cells
		// back**: a player reaches six blocks and stands in one chunk, so what
		// has to answer a collision is under their feet, and a chunk drawn
		// coarse is a long way off. A level offers one root in `4^lod`, which
		// is why it can grow them at all.
		const grown =
			this.plants.length > 0 && !this.grid
				? plantChunk(
						chunk,
						this.generator(job.lod),
						shape,
						this.plants,
						this.seed,
						this.shape.subdivisionDepth,
						this.templates(job.lod),
						this.biomeField,
					)
				: null;
		// What lands in the triangle is written into the chunk; what lands on
		// the ring past its rim comes back and goes to the sampler, which is
		// the only thing that ever reads those cells.
		const outside =
			job.deltas?.length && !this.grid
				? applyDeltas(
						chunk,
						job.deltas.map((row) => ({
							chunkKey: row.chunkKey,
							deltas: ChunkDeltas.unpack(row.where, row.what),
						})),
						this.shape.subdivisionDepth,
						job.lod,
					)
				: null;
		const sampler =
			this.grid && this.flat
				? { columnAt: () => this.flat! }
				: new ChunkColumnSampler(
						chunk,
						this.generator(job.lod),
						outside,
					);
		const mesh = buildChunkMesh(
			chunk,
			sampler,
			shape,
			this.seed,
			// Every level snaps its surface caps to the finest level's grid,
			// which is what merges the levels where the terrain agrees.
			{
				apron: this.apron,
				surfaceGrid: this.shape.blockSize,
				debugSeams: this.debugSeams,
				speckle: this.speckle,
				textureLayers: this.textureLayers ?? undefined,
				ambientOcclusion: this.ambientOcclusion,
				skyExposure: this.skyExposure,
				// **Only where a hole is worth its faces.** A level out is a
				// block twice as wide, twice as far off, wearing the same
				// picture -- and the plant pass has already turned two thirds
				// of that level's leaves into the colour of the ground. See
				// {@link CUTOUT_REACH}.
				cutoutLeaves: this.cutoutLeaves && job.lod <= CUTOUT_REACH,
				// **The sealed-air flood runs only where it can find anything.**
				// It costs about a tenth of a caveless chunk's mesh time and
				// can find nothing there: a sealed stretch needs below-ground
				// air, which only the cave pass and a player's own digging
				// make. So it runs where the caves are carved at all, and on
				// any chunk carrying edits -- a hidden room someone built is
				// exactly a sealed stretch, and rebuilding on a break is what
				// makes its walls appear the moment a shaft reaches it.
				cullSealed:
					(this.options.caves === true &&
						job.lod <= CAVE_DETAIL_REACH) ||
					(job.deltas?.length ?? 0) > 0,
				// The canopy that is a colour rather than a block: what a
				// plant becomes once this level's grid is more than twice as
				// wide as it is.
				cover: grown?.cover ?? null,
				grid: this.grid
					? {
							...this.grid,
							lod: job.lod,
							// The finest chunk level, however coarse this
							// chunk is: the two always sum to it.
							finest: job.lod + job.chunkLevel,
						}
					: undefined,
			},
		);
		return {
			id: job.id,
			key: job.key,
			chunkLevel: job.chunkLevel,
			lod: job.lod,
			origin: [mesh.origin.x, mesh.origin.y, mesh.origin.z],
			bound: mesh.bound,
			opaque: mesh.opaque,
			cutout: mesh.cutout,
			translucent: mesh.translucent,
			tally: mesh.tally,
			...(grown && job.lod === 0
				? { plants: { where: grown.where, what: grown.what } }
				: {}),
		};
	}

	/**
	 * A chunk of the flat shell: every column solid to the crust top.
	 *
	 * The world's highest point, not the local ground -- one radius for the
	 * whole planet, so the shell is exactly a sphere and the grid is the only
	 * thing it shows. Nothing is generated: the terrain is still selected and
	 * levelled as it always is, and this is the build step declining to run
	 * the noise.
	 */
	private flatChunk(job: MeshJob, shape: WorldShape): Chunk {
		const chunk = new Chunk(
			ChunkAddress.fromKey(job.key, job.chunkLevel),
			shape.subdivisionDepth,
			job.chunkLevel,
			2,
		);
		chunk.blocks.fill(BlockType.STONE);
		for (let slot = 0; slot < chunk.slots; slot++) {
			chunk.band[slot * 2] = 0;
			chunk.band[slot * 2 + 1] = -1;
			chunk.surface[slot * 2] = this.shape.crustTopRadius;
			chunk.surface[slot * 2 + 1] = 0;
		}
		return chunk;
	}

	/** The buffers in a result, for a caller transferring rather than copying. */
	static buffers(result: MeshResult): ArrayBuffer[] {
		return [
			result.opaque.vertices.buffer,
			result.opaque.indices.buffer,
			result.cutout.vertices.buffer,
			result.cutout.indices.buffer,
			result.translucent.vertices.buffer,
			result.translucent.indices.buffer,
		];
	}

	/** The pre-grown plants for one level, made when that level is first drawn. */
	private templates(lod: number): PlantTemplateStore {
		const already = this.templatesByLod.get(lod);
		if (already) return already;
		const level = this.shape.atLod(lod);
		const made = new PlantTemplateStore(
			this.seed,
			level.subdivisionDepth,
			level.blockSize,
			level.seaLevelRadius,
		);
		this.templatesByLod.set(lod, made);
		return made;
	}

	private generator(lod: number): TerrainGenerator {
		const already = this.byLod.get(lod);
		if (already) return already;
		// **A coarse chunk's generator has the cave pass off.** The generator
		// itself stays level-blind (doc 14, F-032 -- heights must not move
		// with the level); whether the sheet is carved at all is gated here,
		// in the one place that knows the level, the way {@link CUTOUT_REACH}
		// gates the leaf holes. See {@link CAVE_DETAIL_REACH}.
		const made = new TerrainGenerator(
			this.seed,
			this.shape.atLod(lod),
			this.map,
			lod <= CAVE_DETAIL_REACH
				? this.options
				: { ...this.options, caves: false },
			this.biomeField,
		);
		this.byLod.set(lod, made);
		return made;
	}
}
