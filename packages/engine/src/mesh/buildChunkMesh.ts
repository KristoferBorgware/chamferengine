import type { Chunk } from "../generation/chunk/Chunk.js";
import type { ChunkMesh } from "./ChunkMesh.js";
import type { ColumnSampler } from "../generation/chunk/ColumnSampler.js";
import type { MeshOptions } from "./MeshOptions.js";
import type { WorldShape } from "../world/WorldShape.js";
import { ArrayMeshSink } from "./ArrayMeshSink.js";
import { Vec3 } from "../math/Vec3.js";
import { joinPath } from "../addressing/lattice/joinPath.js";
import { latticePosition } from "../addressing/lattice/latticePosition.js";
import { meshChunk } from "./meshChunk.js";

/**
 * Mesh a chunk into two array-backed buffers.
 *
 * The origin is the chunk's own first corner at sea level, which is inside the
 * chunk and fixed by its address, so it needs nothing beyond what the caller
 * already has.
 */
export function buildChunkMesh(
	chunk: Chunk,
	sampler: ColumnSampler,
	shape: WorldShape,
	seed: number,
	options: MeshOptions = {},
): ChunkMesh {
	const [i, j] = joinPath(chunk.address.path, 0, 0, chunk.depth);
	const origin = latticePosition(
		chunk.address.face,
		1 << chunk.depth,
		i,
		j,
	).scale(shape.seaLevelRadius);

	const opaque = new ArrayMeshSink();
	const translucent = new ArrayMeshSink(256);
	const tally = meshChunk(
		chunk,
		sampler,
		shape,
		seed,
		origin,
		opaque,
		translucent,
		options,
	);
	return {
		key: chunk.address.key,
		origin: new Vec3(origin.x, origin.y, origin.z),
		opaque: opaque.build(tally.cells),
		translucent: translucent.build(tally.cells),
		tally,
	};
}
