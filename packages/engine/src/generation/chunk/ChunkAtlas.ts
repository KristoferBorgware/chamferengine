import type { ChunkExtent } from "./chunkCenter.js";
import { ChunkAddress } from "./ChunkAddress.js";
import { chunkCenter } from "./chunkCenter.js";

/**
 * Every chunk on the planet, with where it sits, computed once per level.
 *
 * At chunk level 6 that is 81,920 entries. Selecting from them is one dot
 * product each, which is the same test interest management runs per player.
 */
export class ChunkAtlas {
	readonly depth: number;
	readonly chunkLevel: number;
	readonly extents: readonly ChunkExtent[];

	constructor(depth: number, chunkLevel: number) {
		this.depth = depth;
		this.chunkLevel = chunkLevel;
		const count = ChunkAddress.countAt(chunkLevel);
		const extents: ChunkExtent[] = new Array<ChunkExtent>(count);
		for (let key = 0; key < count; key++)
			extents[key] = chunkCenter(
				ChunkAddress.fromKey(key, chunkLevel),
				depth,
				chunkLevel,
			);
		this.extents = extents;
	}
}
