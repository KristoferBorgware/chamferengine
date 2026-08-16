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
	// The ball everything drawn falls inside, over both buffers, moved back
	// into world space from the origin the vertices are written against.
	const solid = opaque.bounds();
	const wet = translucent.bounds();
	const ball = merge(solid, wet);
	return {
		key: chunk.address.key,
		origin: new Vec3(origin.x, origin.y, origin.z),
		center: [
			ball.center[0] + origin.x,
			ball.center[1] + origin.y,
			ball.center[2] + origin.z,
		],
		radius: ball.radius,
		opaque: opaque.build(tally.cells),
		translucent: translucent.build(tally.cells),
		tally,
	};
}

/** One ball around two, or around whichever of them holds anything. */
function merge(
	a: { center: [number, number, number]; radius: number },
	b: { center: [number, number, number]; radius: number },
): { center: [number, number, number]; radius: number } {
	if (a.radius === 0) return b;
	if (b.radius === 0) return a;
	const dx = b.center[0] - a.center[0];
	const dy = b.center[1] - a.center[1];
	const dz = b.center[2] - a.center[2];
	const apart = Math.sqrt(dx * dx + dy * dy + dz * dz);
	if (apart + b.radius <= a.radius) return a;
	if (apart + a.radius <= b.radius) return b;
	const radius = (apart + a.radius + b.radius) / 2;
	const along = apart > 0 ? (radius - a.radius) / apart : 0;
	return {
		center: [
			a.center[0] + dx * along,
			a.center[1] + dy * along,
			a.center[2] + dz * along,
		],
		radius,
	};
}
