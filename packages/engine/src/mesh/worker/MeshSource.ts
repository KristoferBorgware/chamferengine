import type { ChunkMesh } from "../ChunkMesh.js";
import type { ChunkSelection } from "../../generation/chunk/selectChunks.js";

/**
 * Where a chunk's triangles come from.
 *
 * The residency loop asks for a selection and gets a promise. Behind it is
 * either the calling thread or a pool of workers, and neither appears in the
 * caller.
 *
 * A mesh comes back keyed by {@link selectionId}, not by the chunk key: a
 * selection names a triangle at a level, and the same key at two levels is two
 * different triangles.
 */
export interface MeshSource {
	request(selection: ChunkSelection): Promise<ChunkMesh>;

	/** Stop work on a chunk nobody is waiting for any more. */
	cancel(selection: ChunkSelection): void;

	dispose(): void;
}
