import type { CoarseMapSnapshot } from "../../generation/coarse/CoarseMapSnapshot.js";
import type { Box } from "../../math/Box.js";
import type { Geometry } from "../Geometry.js";
import type { GridParts } from "../GridPaint.js";
import type { MeshTally } from "../meshChunk.js";
import type { ProbeVolume } from "../../light/probeVolume.js";
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

	/** Whether a corner darkens by how many of its neighbours are solid. */
	readonly ambientOcclusion?: boolean;

	/** Whether a face darkens by how much sky the ground around it leaves it. */
	readonly skyExposure?: boolean;

	/** How much of the light a blocked direction intercepts comes back. */
	readonly skyBounce?: number;

	/**
	 * Cells between light probes, or zero for none at all.
	 *
	 * Off means no volume is built and none travels, so a world with probes
	 * switched off pays nothing for them -- not a pass that returns one.
	 */
	readonly probeSpacing?: number;

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

/**
 * The switches a worker bakes into a vertex colour, changed under a live pool.
 *
 * These move no block: the terrain is a function of a face and a lattice
 * offset and never sees any of them. What they change is a number the mesher
 * multiplies into a vertex colour, which no shader can divide back out -- so
 * they need every chunk built again and need nothing else built at all.
 *
 * Sent rather than folded into a fresh {@link MeshWorkerSetup} because a setup
 * carries the coarse map, five typed arrays that a structured clone copies
 * once per worker. The map is exactly what these knobs leave alone.
 */
export interface MeshRetune {
	readonly kind: "retune";
	readonly speckle: number;
	readonly ambientOcclusion: boolean;
	readonly skyExposure: boolean;
	readonly skyBounce: number;
	readonly probeSpacing: number;
}

export type MeshWorkerMessage = MeshWorkerSetup | MeshJob | MeshRetune;

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

	/** The box everything drawn falls inside, in world space. */
	readonly bound: Box;

	readonly opaque: Geometry;
	readonly translucent: Geometry;
	readonly tally: MeshTally;

	/**
	 * How much light reaches each point of a sparse grid over this chunk, and
	 * which way it comes from. Absent when probes are switched off.
	 *
	 * It travels with the mesh because it is built from the same blocks, in
	 * the same job, and the blocks never cross back -- so this is the only
	 * moment anything on the thread that draws can learn what a hollow inside
	 * the chunk looks like.
	 */
	readonly probes?: ProbeVolume;
}
