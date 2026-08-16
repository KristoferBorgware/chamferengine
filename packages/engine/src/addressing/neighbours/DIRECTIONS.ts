/**
 * The six lattice steps, counter-clockwise as seen from outside the sphere.
 *
 * Index 0 is the step from the face's vertex `A` toward `B`, the offset
 * `(+1, 0)`. That anchor is a property of the cell's own face, so it never
 * depends on how the cell was reached, and a stored rotation means the same
 * direction wherever it is read.
 *
 * Negating an offset is exactly `k -> k + 3`, which is the same half turn a
 * middle-child descent applies.
 */
export const DIRECTIONS: readonly (readonly [number, number])[] = [
	[1, 0],
	[0, 1],
	[-1, 1],
	[-1, 0],
	[0, -1],
	[1, -1],
];
