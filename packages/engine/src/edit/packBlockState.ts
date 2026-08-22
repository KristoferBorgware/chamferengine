import type { BlockState } from "./BlockState.js";
import { ROTATION_MASK, TYPE_BITS, TYPE_MASK } from "./BlockState.js";

/** Pack a type and a rotation into the sixteen bits a record carries. */
export function packBlockState(type: number, rotation = 0): BlockState {
	return ((rotation & ROTATION_MASK) << TYPE_BITS) | (type & TYPE_MASK);
}
