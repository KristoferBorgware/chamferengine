import type { Chunk } from "./Chunk.js";

/**
 * Where a chunk comes from.
 *
 * The renderer and the residency loop ask for chunks by key and get a promise.
 * Behind it is either the calling thread or a pool of workers, and neither
 * appears in the caller.
 */
export interface ChunkSource {
	request(key: number): Promise<Chunk>;

	/** Stop work on a chunk nobody is waiting for any more. */
	cancel(key: number): void;

	dispose(): void;
}
