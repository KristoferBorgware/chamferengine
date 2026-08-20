import { ChunkAddress } from "./ChunkAddress.js";

/**
 * Whether two already-decoded chunk addresses cover any common ground.
 *
 * {@link chunkOverlaps} unpacks a key before asking this; a caller comparing
 * one address against many -- {@link dropReplaced} in the client, checking
 * every retiring chunk against a whole selection -- decodes each address once
 * and asks this instead. Unpacking a key walks its path digit by digit and
 * builds a fresh array, so paying for it once per address rather than once
 * per pair is the difference between `O(n + m)` decodes and `O(n * m)`.
 */
export function addressesOverlap(a: ChunkAddress, b: ChunkAddress): boolean {
	if (a.face !== b.face) return false;
	const short = a.path.length <= b.path.length ? a.path : b.path;
	const long = short === a.path ? b.path : a.path;
	for (let level = 0; level < short.length; level++)
		if (short[level] !== long[level]) return false;
	return true;
}
