import type { MeshJob, MeshResult, MeshWorkerSetup } from "./MeshJob.js";
import { ChunkAddress } from "../../generation/chunk/ChunkAddress.js";
import { ChunkColumnSampler } from "../../generation/chunk/ChunkColumnSampler.js";
import { CoarseMap } from "../../generation/coarse/CoarseMap.js";
import { TerrainGenerator } from "../../generation/terrain/TerrainGenerator.js";
import { WorldShape } from "../../world/WorldShape.js";
import { buildChunkMesh } from "../buildChunkMesh.js";
import { generateChunk } from "../../generation/chunk/generateChunk.js";
import { seamFloor } from "../seamFloor.js";

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
	private readonly skirtCells: number;
	private readonly options: MeshWorkerSetup["terrain"];

	/**
	 * One generator per level, made when a level is first asked for.
	 *
	 * A chunk one level coarser samples the terrain at twice the spacing over
	 * four times the area, so it holds the same slots and there are four times
	 * fewer of them.
	 */
	private readonly byLod = new Map<number, TerrainGenerator>();

	constructor(setup: MeshWorkerSetup) {
		this.map = CoarseMap.fromSnapshot(setup.map);
		this.shape = new WorldShape(
			setup.seaLevelRadius,
			setup.subdivisionDepth,
			setup.maxElevation,
			setup.crustDepth,
		);
		this.seed = setup.map.seed;
		this.skirtCells = setup.skirtCells;
		this.options = setup.terrain;
	}

	run(job: MeshJob): MeshResult {
		const shape = this.shape.atLod(job.lod);
		const terrain = this.generator(job.lod);
		const chunk = generateChunk(
			terrain,
			ChunkAddress.fromKey(job.key, job.chunkLevel),
			job.chunkLevel,
			shape.crustDepth,
		);
		// The levels a neighbour can be drawn at bracket this one, and their
		// surfaces are where a skirt may have to reach.
		const brackets: TerrainGenerator[] = [];
		if (job.lod > 0) brackets.push(this.generator(job.lod - 1));
		if (job.chunkLevel > 0) brackets.push(this.generator(job.lod + 1));
		const mesh = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, terrain),
			shape,
			this.seed,
			// Every level snaps its surface caps to the finest level's grid,
			// which is what merges the levels where the terrain agrees.
			{
				skirtCells: this.skirtCells,
				surfaceGrid: this.shape.blockSize,
				seamFloor: seamFloor(shape.n, brackets),
			},
		);
		return {
			id: job.id,
			key: job.key,
			chunkLevel: job.chunkLevel,
			lod: job.lod,
			origin: [mesh.origin.x, mesh.origin.y, mesh.origin.z],
			center: mesh.center,
			radius: mesh.radius,
			opaque: mesh.opaque,
			translucent: mesh.translucent,
			tally: mesh.tally,
		};
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
