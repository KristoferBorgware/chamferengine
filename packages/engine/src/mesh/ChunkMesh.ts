import type { Box } from "../math/Box.js";
import type { PlantCells } from "./worker/MeshJob.js";
import type { Geometry } from "./Geometry.js";
import type { MeshTally } from "./meshChunk.js";
import type { Vec3 } from "../math/Vec3.js";

/**
 * One chunk's triangles, split by how they are drawn.
 *
 * Three buffers rather than one, because the three are drawn three ways. The
 * opaque pass writes depth. The cutout pass writes depth too and throws away
 * the pixels its picture has holes in, which is a fragment stage the opaque
 * pass would run over the whole world to no purpose. The translucent pass
 * reads depth without writing it, and sorting it back to front is only
 * possible if it is separate from the other two.
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
	readonly cutout: Geometry;
	readonly translucent: Geometry;
	readonly tally: MeshTally;

	/**
	 * Every cell this chunk's plants wrote, or absent where none did.
	 *
	 * A plant is a block like any other, so everything that asks what is
	 * somewhere has to get the same answer -- and the seed cannot give it,
	 * because a plant comes out of a walk over every root within reach of the
	 * chunk's rim rather than out of one column.
	 */
	readonly plants?: PlantCells;
}
