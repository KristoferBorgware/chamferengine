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
 */
export function chunkOverlaps(
	aLevel: number,
	aKey: number,
	bLevel: number,
	bKey: number,
): boolean {
	const a = ChunkAddress.fromKey(aKey, aLevel);
	const b = ChunkAddress.fromKey(bKey, bLevel);
	if (a.face !== b.face) return false;
	const short = a.path.length <= b.path.length ? a.path : b.path;
	const long = short === a.path ? b.path : a.path;
	for (let level = 0; level < short.length; level++)
		if (short[level] !== long[level]) return false;
	return true;
}
