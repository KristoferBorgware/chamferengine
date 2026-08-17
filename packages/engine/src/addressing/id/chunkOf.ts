import type { CellId } from "./CellId.js";
import { shifts } from "./shifts.js";

/**
 * The chunk a cell belongs to, as the same word with everything below the chunk
 * cut set to zero.
 *
 * The cut is a place to read rather than a stored field, so moving it changes
 * no bit of any stored ID.
 */
export function chunkOf(id: CellId, depth: number, chunkLevel: number): CellId {
	const [high, low] = id;
	const word = (BigInt(high >>> 0) << 32n) | BigInt(low >>> 0);

	const s = shifts(depth);
	const cut = BigInt(s.path + 2 * (depth - chunkLevel));
	const masked = (word >> cut) << cut;

	return [Number(masked >> 32n), Number(masked & 0xffffffffn)];
}
