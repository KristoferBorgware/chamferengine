import type { ClimateFit } from "chamfer/generation";
import type { PlanetKnobs } from "./PlanetSettings.js";

/** One rebuild of the ground and the biomes named over it. */
export interface BiomesRequest {
	readonly kind: "build";

	/** Rises with every request, so a stale reply can be recognised and dropped. */
	readonly token: number;

	readonly knobs: PlanetKnobs;

	/**
	 * How many map cells across to cut the patch, when that is not the knob.
	 *
	 * A slider being dragged asks for half the width, so the ground follows
	 * the pointer and the settled value builds the patch that was asked for.
	 */
	readonly cells: number;
}

/** A stage started or moved, so the status line can say what is happening. */
export interface BiomesStep {
	readonly kind: "step";
	readonly token: number;
	readonly says: string;
	readonly done: number;
}

/**
 * The whole planet's biome readings, one entry per pixel of a flat picture.
 *
 * **Samples, not pixels.** Which picture is drawn -- the biome map, the
 * landform, either climate field, the push or the regions -- is a choice made
 * while looking at the last one, so the worker sends what every picture is
 * drawn from and the thread that draws paints whichever is asked for.
 */
export interface BiomeSheet {
	readonly width: number;
	readonly height: number;

	/** The biome's block per sample, `0` over the sea. */
	readonly block: Uint16Array<ArrayBuffer>;

	/** The landform index, `-1` over the sea. */
	readonly landform: Int8Array<ArrayBuffer>;

	/** The finished climate, `0` to `1` in the fitted square. */
	readonly t: Float32Array<ArrayBuffer>;
	readonly h: Float32Array<ArrayBuffer>;

	/** The push the warp added, `-1` to `1` per axis. */
	readonly pushT: Float32Array<ArrayBuffer>;
	readonly pushH: Float32Array<ArrayBuffer>;

	/** The region's key, `-1` with regions off or over the sea. */
	readonly region: Float64Array<ArrayBuffer>;

	/** Metres above sea level, for the coastline every picture carries. */
	readonly metres: Float32Array<ArrayBuffer>;
}

/**
 * The climate the diagram's cloud draws, one entry per hexagon of a
 * rectangle.
 *
 * **A patch and the planet are different questions asked of the same
 * cloud.** The planet's is {@link BiomeSheet}, a picture; this is the same
 * three fields read over the patch alone, small enough to send whole and
 * redrawn with no subsampling -- the diagram saying which part of itself the
 * camera is standing in, rather than what the whole world reaches.
 */
export interface BiomeCloud {
	readonly t: Float32Array<ArrayBuffer>;
	readonly h: Float32Array<ArrayBuffer>;

	/** The landform index, `-1` over the sea. */
	readonly landform: Int8Array<ArrayBuffer>;
}

/** Everything a finished build hands back that is a number rather than a buffer. */
export interface BiomesFacts {
	/** Cells on the map, and columns the patch drew. */
	readonly cells: number;
	readonly cellsDrawn: number;

	/** How wide one of the patch's columns is, in metres. */
	readonly columnMetres: number;

	/** Metres from one side of the patch to the other. */
	readonly span: number;

	readonly ms: number;

	/** How much of the planet stands above sea level, `0` to `1`. */
	readonly land: number;

	/** The ground this patch reached, in metres, and how much of it is dry. */
	readonly lowest: number;
	readonly highest: number;
	readonly landShare: number;

	/** Per biome, its share of the planet's land and of the patch's. */
	readonly planetShares: readonly number[];
	readonly patchShares: readonly number[];

	/** Per landform, the same two shares. */
	readonly formPlanet: readonly number[];
	readonly formPatch: readonly number[];

	/** Per landform-grid cell, its share of the planet's land. */
	readonly gridShares: readonly number[];

	/** How many biomes the planet builds anywhere, and the patch holds. */
	readonly built: number;
	readonly patchBiomes: number;

	/** Where the climate square was fitted, and the regions' rounded size. */
	readonly fit: ClimateFit;
	readonly regionLevel: number;
	readonly regionMetres: number;
}

/** The patch as the renderer takes it: the buffers, moved rather than copied. */
export interface BiomesGeometry {
	readonly vertices: Float32Array<ArrayBuffer>;
	readonly lines: Uint32Array<ArrayBuffer> | null;
	readonly groundVertices: number;
	readonly waterVertices: number;
	readonly bounds: {
		readonly low: readonly [number, number, number];
		readonly high: readonly [number, number, number];
	};
	readonly rawLow: number;
	readonly rawHigh: number;
}

/** A build finished, with everything drawn from it. */
export interface BiomesReady {
	readonly kind: "ready";
	readonly token: number;
	readonly facts: BiomesFacts;

	/** The planet's readings, when they moved since the last build. */
	readonly planet: BiomeSheet | null;

	/** The patch's own climate, one hexagon at a time. */
	readonly patch: BiomeCloud;

	readonly geometry: BiomesGeometry | null;
}

/** A build that could not be made, with the reason a reader can act on. */
export interface BiomesFailed {
	readonly kind: "failed";
	readonly token: number;
	readonly why: string;
}

export type BiomesReply = BiomesStep | BiomesReady | BiomesFailed;
