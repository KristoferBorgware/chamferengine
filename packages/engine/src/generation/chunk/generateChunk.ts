import type { ChunkAddress } from "./ChunkAddress.js";
import type { TerrainGenerator } from "../terrain/TerrainGenerator.js";
import { Chunk } from "./Chunk.js";
import { joinPath } from "../../addressing/lattice/joinPath.js";
import { rank } from "../../addressing/lattice/rank.js";

/**
 * Fill a chunk from the terrain, as a pure function of the seed and the
 * address.
 *
 * One column evaluation per slot, then one write of the column. The height
 * field runs 561 times at depth 11 and chunk level 6, whether the crust is 64
 * layers or 435.
 *
 * Every slot of the triangle is filled, including the ones a neighbouring chunk
 * owns.
 */
export function generateChunk(
	terrain: TerrainGenerator,
	address: ChunkAddress,
	chunkLevel: number,
	layerCount: number,
): Chunk {
	const depth = terrain.shape.subdivisionDepth;
	const chunk = new Chunk(address, depth, chunkLevel, layerCount);
	const m = chunk.m;

	for (let q = 0; q <= m; q++)
		for (let r = 0; q + r <= m; r++) {
			const [i, j] = joinPath(address.path, q, r, depth);
			const column = terrain.columnAt(address.face, i, j);
			const slot = rank(q, r, m);
			const band = terrain.fillColumn(
				column,
				chunk.blocks,
				slot * layerCount,
				layerCount,
			);
			chunk.band[slot * 2] = band.first;
			chunk.band[slot * 2 + 1] = band.last;
			chunk.surface[slot * 2] = column.groundRadius;
			chunk.surface[slot * 2 + 1] = column.waterRadius;
		}
	return chunk;
}
