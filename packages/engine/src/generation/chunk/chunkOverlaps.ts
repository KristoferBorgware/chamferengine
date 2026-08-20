import { addressesOverlap } from "./addressesOverlap.js";
import { ChunkAddress } from "./ChunkAddress.js";

/**
 * Whether two chunk triangles cover any common ground.
 *
 * The hierarchy nests exactly, so two triangles overlap when one is the other
 * or its ancestor — one path a prefix of the other, on the same face.
 * Distinct siblings never overlap and different faces never do. This is what
 * lets a chunk leaving the selection wait for its replacements: the wanted
 * chunks overlapping its triangle are exactly the ones that will cover its
 * ground.
 *
 * Unpacks both keys and asks {@link addressesOverlap}. A caller comparing one
 * address against many should decode once and call that directly instead —
 * see its own comment for what unpacking on every pair costs.
 */
export function chunkOverlaps(
	aLevel: number,
	aKey: number,
	bLevel: number,
	bKey: number,
): boolean {
	return addressesOverlap(
		ChunkAddress.fromKey(aKey, aLevel),
		ChunkAddress.fromKey(bKey, bLevel),
	);
}
