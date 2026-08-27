import type { Box } from "../math/Box.js";
import type { ProbeVolume } from "../light/probeVolume.js";
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
 *
 * `bound` is the box everything drawn falls inside, in world space, turned so
 * its long axis points down through the planet. A renderer tests that against
 * the view to decide whether the chunk is looked at, which is a different
 * question from whether it is held: turning is instant and building is not, so
 * a chunk behind the camera stays resident and goes undrawn.
 *
 * **A box and not a ball, because a dug chunk is a shaft.** Ground alone is a
 * thin cap and either shape fits it; a chunk mined to the bottom of the crust
 * reaches hundreds of metres down and a ball round that reaches as far sideways
 * as it does downward, so the whole neighbourhood votes to be drawn.
 */
export interface ChunkMesh {
	readonly key: number;
	readonly origin: Vec3;
	readonly bound: Box;
	readonly opaque: Geometry;
	readonly translucent: Geometry;
	readonly tally: MeshTally;

	/**
	 * How much light reaches each point of a sparse grid inside this chunk,
	 * and which way it comes from. Absent when probes are switched off.
	 */
	readonly probes?: ProbeVolume;
}
