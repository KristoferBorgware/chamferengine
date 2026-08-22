import type { BlockState } from "./BlockState.js";
import { ROTATION_MASK, TYPE_BITS } from "./BlockState.js";

/** The rotation a packed state names, as a direction index into the cell's ring. */
export function rotationOf(state: BlockState): number {
	return (state >>> TYPE_BITS) & ROTATION_MASK;
}
