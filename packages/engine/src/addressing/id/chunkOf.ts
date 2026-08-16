import { shifts } from "./shifts.js";

/**
 * The chunk a cell belongs to, as the same word with everything below the chunk
 * cut set to zero.
 *
 * The cut is a place to read rather than a stored field, so moving it changes
 * no bit of any stored ID.
 */
export function chunkOf(id: number, depth: number, chunkLevel: number): number {
	const s = shifts(depth);
	const low = s.path + 2 * (depth - chunkLevel);
	return Math.floor(id / 2 ** low) * 2 ** low;
}
