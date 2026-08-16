import type { Geometry } from "./Geometry.js";
import type { MeshTally } from "./meshChunk.js";
import type { Vec3 } from "../math/Vec3.js";

/**
 * One chunk's triangles, split by how they are drawn.
 *
 * Two buffers rather than one, because the opaque pass writes depth and the
 * translucent pass reads it without writing. Sorting one back to front is only
 * possible if it is separate from the other.
 *
 * `origin` is the point positions are written relative to. Identity is integer
 * and world positions are `float64`, and this is where a position becomes
 * `float32` for the GPU: relative to a point a chunk's width away, `float32`
 * resolves 122 micrometres at radius 1,700 m.
 */
export interface ChunkMesh {
	readonly key: number;
	readonly origin: Vec3;
	readonly opaque: Geometry;
	readonly translucent: Geometry;
	readonly tally: MeshTally;
}
