import type { ChunkMesh } from "../ChunkMesh.js";
import type { ChunkSelection } from "../../generation/chunk/selectChunks.js";
import type { MeshSource } from "./MeshSource.js";
import type { MeshWorkerSetup } from "./MeshJob.js";
import { MeshWorkerCore } from "./MeshWorkerCore.js";
import { Vec3 } from "../../math/Vec3.js";
import { selectionId } from "../../generation/chunk/selectionId.js";

/**
 * A mesh source that builds on the calling thread.
 *
 * This is what a test uses and what a build without workers falls back to. It
 * blocks the caller for as long as a chunk takes, which at the worked planet's
 * settings is longer than a frame.
 */
export class InlineMeshSource implements MeshSource {
	private readonly core: MeshWorkerCore;
	private next = 1;

	constructor(setup: MeshWorkerSetup) {
		this.core = new MeshWorkerCore(setup);
	}

	request(selection: ChunkSelection): Promise<ChunkMesh> {
		const result = this.core.run({
			kind: "chunk",
			id: this.next++,
			key: selection.key,
			chunkLevel: selection.chunkLevel,
			lod: selection.lod,
		});
		return Promise.resolve({
			key: selectionId(result.chunkLevel, result.key),
			origin: new Vec3(...result.origin),
			center: result.center,
			radius: result.radius,
			opaque: result.opaque,
			translucent: result.translucent,
			tally: result.tally,
		});
	}

	cancel(): void {}

	dispose(): void {}
}
