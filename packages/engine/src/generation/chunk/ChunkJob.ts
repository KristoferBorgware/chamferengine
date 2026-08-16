import type { CoarseMapSnapshot } from "../coarse/CoarseMapSnapshot.js";
import type { TerrainOptions } from "../terrain/TerrainOptions.js";

/** What a worker is told once, before any chunk is asked for. */
export interface ChunkWorkerSetup {
	readonly kind: "setup";
	readonly map: CoarseMapSnapshot;
	readonly seaLevelRadius: number;
	readonly subdivisionDepth: number;
	readonly maxElevation: number;
	readonly crustDepth: number;
	readonly chunkLevel: number;
	readonly terrain: TerrainOptions;
}

/** One chunk asked for. */
export interface ChunkJob {
	readonly kind: "chunk";
	readonly id: number;
	readonly key: number;
}

export type ChunkWorkerMessage = ChunkWorkerSetup | ChunkJob;

/** One chunk answered, as the two arrays and nothing else. */
export interface ChunkResult {
	readonly id: number;
	readonly key: number;
	readonly blocks: Uint16Array;
	readonly groundLayer: Uint16Array;
}
