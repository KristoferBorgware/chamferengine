import type { BenchSheet } from "./BenchMessage.js";
import type { PlanetKnobs } from "./PlanetSettings.js";

/** One rebuild of everything the cave bench draws. */
export interface CaveRequest {
	readonly kind: "build";

	/** Rises with every request, so a stale reply can be recognised and dropped. */
	readonly token: number;

	/**
	 * The whole draft.
	 *
	 * A plain object rather than a `PlanetSettings`, because a class does not
	 * survive being posted. The worker builds its own from these, so the
	 * arithmetic between what is typed and what the engine takes is done once
	 * and in one place.
	 */
	readonly knobs: PlanetKnobs;
}

/** A stage started or moved, so the status line can say what is happening. */
export interface CaveStep {
	readonly kind: "step";
	readonly token: number;
	readonly says: string;

	/** How far through that stage this is, from zero to one. */
	readonly done: number;
}

/** A build that could not finish, with what stopped it. */
export interface CaveFailed {
	readonly kind: "failed";
	readonly token: number;
	readonly why: string;
}

/**
 * What the volume came out as.
 *
 * **A cave you cannot walk down is a texture, not a cave**, so most of this is
 * about reach: how much of the patch a passage touches, how many separate
 * systems it breaks into, and how many cells wide the narrowest way through one
 * is. A picture cannot answer any of the three -- a plan that reads as a
 * network on paper can rasterise into a hundred disconnected pockets, and that
 * is exactly the failure a picture hides and a count does not.
 */
export interface CaveFacts {
	/** Cells on the coarse map, and columns the patch drew. */
	readonly cells: number;
	readonly cellsDrawn: number;

	/** How wide one of the patch's columns is, in metres. */
	readonly columnMetres: number;

	/** Whether the walk reached every column on the planet. */
	readonly whole: boolean;

	/** Metres from one side of the patch to the other, and how deep it was walked. */
	readonly span: number;
	readonly crust: number;

	/** Blocks a cave opened, and columns holding at least one of them. */
	readonly caveCells: number;
	readonly caveColumns: number;

	/**
	 * The narrowest way through a passage, in cells, at the median column.
	 *
	 * The number that carries to a planet of any size. A cell is one block, so
	 * a passage two cells wide at a 1 m block is two blocks wide however big
	 * the world is; the same plan at a 4 m block is drawn with a quarter of the
	 * cells and may not survive being drawn at all.
	 */
	readonly medianWidth: number;

	/** How much of the void is one cell wide, `0` to `1`. */
	readonly thinShare: number;

	/** Separate systems, the biggest one's share, and how many hold half the void. */
	readonly systems: number;
	readonly largest: number;
	readonly half: number;

	/** Columns a cave opens to the sky, and columns holding rock over air over rock. */
	readonly mouths: number;
	readonly multiSpan: number;

	/** Faces the patch draws, against the same patch with the caves filled in. */
	readonly faces: number;
	readonly facesBare: number;

	/** Triangles the mesh wrote. */
	readonly triangles: number;

	/** Lattice lookups the walk made, per column. */
	readonly lookups: number;

	/** Milliseconds: the coarse map, the column walk, and the mesh. */
	readonly mapMs: number;
	readonly walkMs: number;
	readonly meshMs: number;

	/** What the ground under the patch came to, in metres above sea level. */
	readonly lowest: number;
	readonly highest: number;

	/** How much of the planet stands above sea level, `0` to `1`. */
	readonly land: number;

	/** What the planet is made of, as a share of its cells. */
	readonly bands: readonly number[];

	/** The planet's tallest and deepest ground, in metres from the sea. */
	readonly summit: number;
	readonly floor: number;
}

/**
 * The plan's raster: the cave field at one depth, on a square sample grid.
 *
 * **Samples, not pixels.** Which picture is drawn is a choice made while
 * looking at the last one, so the worker sends what every picture is drawn from
 * and the thread that draws paints whichever is asked for -- and contours it,
 * which is a pass over this same rectangle.
 */
export interface CavePlanSheet {
	/** Points across, both ways. */
	readonly across: number;

	/** Metres from one side of the sampled rectangle to the other. */
	readonly span: number;

	/** What the cave field read at each point, at the plan's own depth. */
	readonly value: Float32Array<ArrayBuffer>;

	/**
	 * The band's half-width at each point: the whole gate, in one number.
	 *
	 * Zero where the column's own ceiling forbids a cave at this depth, so the
	 * dip in the ceiling is visible on the plan as ground where the passage
	 * simply is not.
	 */
	readonly band: Float32Array<ArrayBuffer>;
}

/**
 * The patch's own cells, flat, so the plan can draw the lattice.
 *
 * **The hexagons are what the world is built out of**, and the raster beside
 * them is a picture of the field. Where the two part company is where the
 * lattice cannot draw what the field says, which is the one thing a plan of a
 * cave has to answer.
 */
export interface CaveCells {
	readonly count: number;

	/** Per cell, its middle in the patch's flat frame: east then north, in metres. */
	readonly at: Float32Array<ArrayBuffer>;

	/** Per cell, six corners in the same frame; a pentagon repeats its last. */
	readonly corners: Float32Array<ArrayBuffer>;

	readonly degree: Uint8Array<ArrayBuffer>;

	/** Per cell, its six neighbours as indices into this list, `-1` off the patch. */
	readonly ring: Int32Array<ArrayBuffer>;

	/** Per cell, what the field read at the plan's depth. */
	readonly value: Float32Array<ArrayBuffer>;

	/** Per cell, how far inside the band that reading is: `1` at the spine, `0` outside. */
	readonly open: Float32Array<ArrayBuffer>;

	/** The rectangle the cells fill, in the flat frame, as east then north. */
	readonly low: readonly [number, number];
	readonly high: readonly [number, number];
}

/** The volume as the renderer takes it: the buffers, moved rather than copied. */
export interface CaveGeometry {
	readonly vertices: Float32Array<ArrayBuffer>;
	readonly lines: Uint32Array<ArrayBuffer> | null;
	readonly triangleCount: number;
	readonly groundVertices: number;
	readonly waterVertices: number;
	readonly bounds: {
		readonly low: readonly [number, number, number];
		readonly high: readonly [number, number, number];
	};
	readonly rawLow: number;
	readonly rawHigh: number;
}

/** A finished build. */
export interface CaveReady {
	readonly kind: "ready";
	readonly token: number;
	readonly facts: CaveFacts;

	/** Absent when the mesh was kept: only the cut or a picture moved. */
	readonly geometry: CaveGeometry | null;

	/** Absent when the plan was kept, for the same reason. */
	readonly plan: CavePlanSheet | null;
	readonly cells: CaveCells | null;

	/**
	 * The small map: this patch, and the planet it is a patch of.
	 *
	 * **The two benches are benches of one world**, so the way to stand
	 * somewhere else is the same on both -- click the planet. Each is sent
	 * only when it moved: the planet answers to the world's own rows and the
	 * patch to where it is standing, and a knob that moves neither sends
	 * nothing.
	 */
	readonly patch: BenchSheet | null;
	readonly planet: BenchSheet | null;
}

export type CaveReply = CaveStep | CaveFailed | CaveReady;
