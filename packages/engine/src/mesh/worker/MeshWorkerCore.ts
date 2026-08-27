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
import { SPECKLE } from "../../generation/terrain/blockColor.js";
import { TerrainGenerator } from "../../generation/terrain/TerrainGenerator.js";
import { WorldShape } from "../../world/WorldShape.js";
import { buildChunkMesh } from "../buildChunkMesh.js";
import { applyDeltas } from "../../generation/chunk/applyDeltas.js";
import { generateChunk } from "../../generation/chunk/generateChunk.js";

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
	private ambientOcclusion: boolean;
	private skyExposure: boolean;
	private readonly options: MeshWorkerSetup["terrain"];

	/**
	 * One generator per level, made when a level is first asked for.
	 *
	 * A chunk one level coarser samples the terrain at twice the spacing over
	 * four times the area, so it holds the same slots and there are four times
	 * fewer of them.
	 */
	private readonly byLod = new Map<number, TerrainGenerator>();

	/** The grid switches, and the one flat column every grid cell reads. */
	private readonly grid: GridParts | null;
	private readonly flat: Column | null;

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
		this.ambientOcclusion = setup.ambientOcclusion ?? true;
		this.skyExposure = setup.skyExposure ?? true;
		this.options = setup.terrain;
		this.grid = setup.grid ?? null;
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
				ambientOcclusion: this.ambientOcclusion,
				skyExposure: this.skyExposure,
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
			translucent: mesh.translucent,
			tally: mesh.tally,
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
			result.translucent.vertices.buffer,
			result.translucent.indices.buffer,
		];
	}

	private generator(lod: number): TerrainGenerator {
		const already = this.byLod.get(lod);
		if (already) return already;
		const made = new TerrainGenerator(
			this.seed,
			this.shape.atLod(lod),
			this.map,
			this.options,
		);
		this.byLod.set(lod, made);
		return made;
	}
}
