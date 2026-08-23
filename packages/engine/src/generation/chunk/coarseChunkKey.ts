/**
 * The key of the chunk covering the same ground, at a coarser level.
 *
 * **A chunk key is `face x 4^chunkLevel + path`**, so the same triangle has a
 * different number at every level and a key alone does not say which one it is
 * in. Anything holding chunks at more than one level at once -- the residency
 * set, a selection, an invalidation after an edit -- has to convert rather than
 * compare, or it silently means a different triangle.
 *
 * Triangles nest, so the coarser one is the finer one's path with its last
 * digits dropped.
 */
export function coarseChunkKey(
	chunkKey: number,
	chunkLevel: number,
	coarserLevel: number,
): number {
	if (coarserLevel >= chunkLevel) return chunkKey;
	const span = 4 ** chunkLevel;
	const face = Math.floor(chunkKey / span);
	const path = chunkKey % span;
	return (
		face * 4 ** coarserLevel +
		Math.floor(path / 4 ** (chunkLevel - coarserLevel))
	);
}
