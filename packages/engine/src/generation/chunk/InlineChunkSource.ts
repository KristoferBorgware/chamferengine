import type { Chunk } from "./Chunk.js";
import type { ChunkSource } from "./ChunkSource.js";
import type { TerrainGenerator } from "../terrain/TerrainGenerator.js";
import { ChunkAddress } from "./ChunkAddress.js";
import { generateChunk } from "./generateChunk.js";

/**
 * A chunk source that generates on the calling thread.
 *
 * This is what a test uses and what a build without workers falls back to. It
 * blocks the caller for as long as a chunk takes.
 */
export class InlineChunkSource implements ChunkSource {
	private readonly terrain: TerrainGenerator;
	private readonly chunkLevel: number;
	private readonly layerCount: number;

	constructor(
		terrain: TerrainGenerator,
		chunkLevel: number,
		layerCount: number,
	) {
		this.terrain = terrain;
		this.chunkLevel = chunkLevel;
		this.layerCount = layerCount;
	}

	request(key: number): Promise<Chunk> {
		const address = ChunkAddress.fromKey(key, this.chunkLevel);
		return Promise.resolve(
			generateChunk(
				this.terrain,
				address,
				this.chunkLevel,
				this.layerCount,
			),
		);
	}

	cancel(): void {}

	dispose(): void {}
}
