import type { ChunkJob, ChunkResult, ChunkWorkerSetup } from "./ChunkJob.js";
import { ChunkAddress } from "./ChunkAddress.js";
import { CoarseMap } from "../coarse/CoarseMap.js";
import { TerrainGenerator } from "../terrain/TerrainGenerator.js";
import { WorldShape } from "../../world/WorldShape.js";
import { generateChunk } from "./generateChunk.js";

/**
 * The generating half of a chunk worker, with no reference to `Worker`,
 * `self` or `postMessage`.
 *
 * A worker script is then four lines: make one of these on setup, call
 * {@link run} on each job, post what it returns. Everything worth testing runs
 * under plain Node, and the part that needs a browser holds no logic.
 */
export class ChunkWorkerCore {
	readonly chunkLevel: number;
	private readonly terrain: TerrainGenerator;
	private readonly crustDepth: number;

	constructor(setup: ChunkWorkerSetup) {
		const map = CoarseMap.fromSnapshot(setup.map);
		const shape = new WorldShape(
			setup.seaLevelRadius,
			setup.subdivisionDepth,
			setup.maxElevation,
			setup.crustDepth,
		);
		this.terrain = new TerrainGenerator(
			setup.map.seed,
			shape,
			map,
			setup.terrain,
		);
		this.chunkLevel = setup.chunkLevel;
		this.crustDepth = setup.crustDepth;
	}

	run(job: ChunkJob): ChunkResult {
		const address = ChunkAddress.fromKey(job.key, this.chunkLevel);
		const chunk = generateChunk(
			this.terrain,
			address,
			this.chunkLevel,
			this.crustDepth,
		);
		return {
			id: job.id,
			key: job.key,
			blocks: chunk.blocks,
			groundLayer: chunk.groundLayer,
		};
	}
}
