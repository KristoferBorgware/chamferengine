import type { Box } from "../../math/Box.js";

/**
 * What {@link selectChunks} needs of a view to prune against it.
 *
 * A box test and nothing else, so the selection never learns what a projection
 * matrix or a field of view is, and a caller with some other idea of what is
 * worth building can answer it however it likes. `Frustum` satisfies this as it
 * stands.
 *
 * A box rather than a ball because a chunk is a wedge -- a small triangle
 * extruded down through as much crust as anybody has dug -- and a ball around a
 * deep one has to reach as far sideways as it does downward.
 *
 * **A false yes costs a chunk built and not drawn. A false no costs a hole in
 * the world**, and one that lasts until the player moves far enough to be asked
 * again -- so an implementation that is unsure answers yes.
 */
export interface ChunkCull {
	/** Whether a box might be on screen. */
	holdsBox(box: Box): boolean;
}
