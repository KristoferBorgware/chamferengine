import type { BlockState } from "./BlockState.js";
import { TYPE_MASK } from "./BlockState.js";

/** The block type a packed state names. */
export function typeOf(state: BlockState): number {
	return state & TYPE_MASK;
}
