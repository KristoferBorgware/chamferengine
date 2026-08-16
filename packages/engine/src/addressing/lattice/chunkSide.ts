/** A chunk's side in lattice steps. */
export function chunkSide(depth: number, chunkLevel: number): number {
	return 1 << (depth - chunkLevel);
}
