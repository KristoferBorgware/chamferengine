/**
 * What {@link selectChunks} needs of a view to prune against it.
 *
 * A sphere test and nothing else, so the selection never learns what a
 * projection matrix or a field of view is, and a caller with some other idea
 * of what is worth building can answer it however it likes. `Frustum`
 * satisfies this as it stands.
 *
 * **A false yes costs a chunk built and not drawn. A false no costs a hole in
 * the world**, and one that lasts until the player moves far enough to be
 * asked again -- so an implementation that is unsure answers yes.
 */
export interface ChunkCull {
	/** Whether a sphere might be on screen. */
	holds(x: number, y: number, z: number, radius: number): boolean;
}
