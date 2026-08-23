import type { CoarseMapSnapshot } from "../../generation/coarse/CoarseMapSnapshot.js";
import type { Geometry } from "../Geometry.js";
import type { GridParts } from "../GridPaint.js";
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

	/** How far a cell's color may drift from its type's base. Zero is off. */
	readonly speckle?: number;

	/**
	 * Draw the world as its own grid: a flat shell of hexagons at the crust
	 * top, painted by these switches, in place of the terrain. The selection
	 * and the levels are untouched -- this changes only what a chunk builds.
	 */
	readonly grid?: GridParts | undefined;

	readonly terrain: TerrainOptions;
}

/**
 * One chunk's changed blocks, as the two arrays a structured clone carries.
 *
 * A record is a slot, a layer and sixteen bits of block state, and the slots
 * are counted against the world's own subdivision depth and chunk level rather
 * than against the level this job is drawn at.
 *
 * `chunkKey` says which chunk they were counted in, which is not always the
 * chunk being built: a cell on a border belongs to one triangle and is read by
 * two or three, so a job carries the owner's rows alongside its own.
 */
export interface JobDeltas {
	readonly chunkKey: number;
	readonly where: Uint32Array;
	readonly what: Uint16Array;
}

/** One chunk asked for, at the level it is to be drawn at. */
export interface MeshJob {
	readonly kind: "chunk";
	readonly id: number;
	readonly key: number;
	readonly chunkLevel: number;

	/** How many levels coarser than the finest the chunk is sampled. */
	readonly lod: number;

	/**
	 * The blocks a player changed that this chunk reads, or absent where none
	 * were.
	 *
	 * One entry per chunk the records were written under: this chunk's own, and
	 * those owning cells that sit inside its triangle. They ride with the job
	 * rather than being held by the worker, so the thread that owns the store
	 * is the only one that has to be right about what is in it -- a chunk is
	 * generated from the seed and then patched, once, in the call that meshes
	 * it.
	 */
	readonly deltas?: readonly JobDeltas[];
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
