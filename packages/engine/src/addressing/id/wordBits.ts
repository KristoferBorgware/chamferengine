import { shifts } from "./shifts.js";

/** How wide the word is at a given subdivision depth. */
export function wordBits(depth: number): number {
	return shifts(depth).width;
}
