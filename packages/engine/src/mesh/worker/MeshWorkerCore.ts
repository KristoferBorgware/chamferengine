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
import { MESH_DEFAULTS } from "../MeshOptions.js";
import { SPECKLE } from "../../generation/terrain/blockColor.js";
import type { ProbeVolume } from "../../light/probeVolume.js";
import { TerrainGenerator } from "../../generation/terrain/TerrainGenerator.js";
import { joinPath } from "../../addressing/lattice/joinPath.js";
import { latticePosition } from "../../addressing/lattice/latticePosition.js";
import { probeVolume } from "../../light/probeVolume.js";
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
	private skyBounce: number;
	private probeSpacing: number;
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
		this.skyBounce = setup.skyBounce ?? MESH_DEFAULTS.skyBounce;
		this.probeSpacing = setup.probeSpacing ?? 0;
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
		this.skyBounce = message.skyBounce;
		this.probeSpacing = message.probeSpacing;
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
				skyBounce: this.skyBounce,
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
			// **Built here or never.** The blocks do not cross back, so this
			// is the only moment anything on the thread that draws can learn
			// the shape of a hollow inside this chunk.
			...(this.probeSpacing > 0 ? { probes: this.probesFor(chunk) } : {}),
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
	/**
	 * A probe volume over the band this chunk's blocks actually occupy.
	 *
	 * The crust runs over a thousand layers and the terrain is a shell inside
	 * it, so covering the whole depth would spend nearly all of the volume on
	 * solid rock nobody can stand in. The band the generator already wrote is
	 * 71 layers of 1,232 on the shipped world, and that is the difference
	 * between a volume worth carrying and one that is not.
	 */
	private probesFor(chunk: Chunk): ProbeVolume {
		let first = chunk.layerCount;
		let last = 0;
		for (let slot = 0; slot < chunk.slots; slot++) {
			const top = chunk.band[slot * 2]!;
			const bottom = chunk.band[slot * 2 + 1]!;
			if (top >= 0 && top < first) first = top;
			if (bottom > last) last = bottom;
		}
		if (first > last) first = last;
		// The triangle's own three corners, as directions. A vertex is a
		// blend of them, so their inverse is what takes a vertex back to the
		// lattice point a probe is filed under.
		const [i0, j0] = joinPath(chunk.address.path, 0, 0, chunk.depth);
		const n = 1 << chunk.depth;
		const corner = (i: number, j: number): [number, number, number] => {
			const at = latticePosition(chunk.address.face, n, i, j);
			return [at.x, at.y, at.z];
		};
		return probeVolume(chunk, this.probeSpacing, first, last, [
			corner(i0, j0),
			corner(i0 + chunk.m, j0),
			corner(i0, j0 + chunk.m),
		]);
	}

	static buffers(result: MeshResult): ArrayBuffer[] {
		const out = [
			result.opaque.vertices.buffer,
			result.opaque.indices.buffer,
			result.translucent.vertices.buffer,
			result.translucent.indices.buffer,
		];
		// Transferred like the geometry rather than copied. It is small, but
		// it is built in this worker and read on the other side exactly once,
		// which is the shape a transfer is for.
		if (result.probes) out.push(result.probes.data.buffer as ArrayBuffer);
		return out;
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
