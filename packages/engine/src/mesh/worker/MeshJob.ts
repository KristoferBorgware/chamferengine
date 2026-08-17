import type { CoarseMapSnapshot } from "../../generation/coarse/CoarseMapSnapshot.js";
import type { Geometry } from "../Geometry.js";
import type { MeshTally } from "../meshChunk.js";
import type { TerrainOptions } from "../../generation/terrain/TerrainOptions.js";

/**
 * What a worker is told once, before any chunk is asked for.
 *
 * The coarse map travels as five typed arrays. Rebuilding it inside each worker
 * would repeat seconds of work as many times as there are cores.
 */
export interface MeshWorkerSetup {
	readonly kind: "setup";
	readonly map: CoarseMapSnapshot;
	readonly seaLevelRadius: number;
	readonly subdivisionDepth: number;
	readonly maxElevation: number;
	readonly crustDepth: number;

	/** Whether a chunk draws the ring of cells just beyond its rim. */
	readonly apron: boolean;

	/** Whether to paint the seams instead of hiding them. */
	readonly debugSeams?: boolean;

	readonly terrain: TerrainOptions;
}

/** One chunk asked for, at the level it is to be drawn at. */
export interface MeshJob {
	readonly kind: "chunk";
	readonly id: number;
	readonly key: number;
	readonly chunkLevel: number;

	/** How many levels coarser than the finest the chunk is sampled. */
	readonly lod: number;
}

export type MeshWorkerMessage = MeshWorkerSetup | MeshJob;

/**
 * One chunk meshed, as the buffers a renderer uploads and nothing else.
 *
 * Blocks never cross back. A chunk is 478 KB of them and 210 KB of geometry,
 * and the thread that asked has no use for the blocks: generating and meshing
 * are one job, and only the second one's output is drawn.
 *
 * `origin` is three numbers rather than a `Vec3` because a structured clone
 * carries fields and not methods.
 */
export interface MeshResult {
	readonly id: number;
	readonly key: number;
	readonly chunkLevel: number;
	readonly lod: number;
	readonly origin: readonly [number, number, number];

	/** The ball everything drawn falls inside, in world space. */
	readonly center: readonly [number, number, number];
	readonly radius: number;

	readonly opaque: Geometry;
	readonly translucent: Geometry;
	readonly tally: MeshTally;
}
