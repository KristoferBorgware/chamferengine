/**
 * One cell of one planet: where on the surface, and how far down.
 *
 * The lattice offset rather than the packed word. A walk produces one of these,
 * an edit names one, and turning it into a chunk and a slot is arithmetic on
 * the same three numbers. The packed word is what a share code and a wire
 * message carry; nothing on the edit path needs it.
 */
export interface CellRef {
	readonly face: number;

	/** Lattice coordinates across the whole face, at full subdivision depth. */
	readonly i: number;
	readonly j: number;

	/** Radial index, counting downward from the crust top. */
	readonly layer: number;
}
