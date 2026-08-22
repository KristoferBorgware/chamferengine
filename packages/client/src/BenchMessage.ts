import type { ErosionReport } from "./BenchWorld.js";
import type { PlanetKnobs } from "./PlanetSettings.js";

/** One rebuild of everything the bench draws. */
export interface BenchRequest {
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
export interface BenchStep {
	readonly kind: "step";
	readonly token: number;
	readonly says: string;

	/** How far through that stage this is, from zero to one. */
	readonly done: number;
}

/** Everything a finished build hands back that is a number rather than a buffer. */
export interface BenchFacts {
	/** Cells on the map, and cells the patch drew. */
	readonly cells: number;
	readonly cellsDrawn: number;

	/** How long the whole build took, in milliseconds. */
	readonly ms: number;

	/** What the planet is made of, as a share of its cells, and its tallest ground. */
	readonly bands: readonly number[];
	readonly summit: number;

	/** What the erosion run did, or nothing when the water is off. */
	readonly report: ErosionReport | null;

	/** Metres from one side of the patch to the other. */
	readonly span: number;

	readonly lowest: number;
	readonly highest: number;

	/** How much of the patch stands above the water. */
	readonly landShare: number;
}

/** The patch as the renderer takes it: the buffers, moved rather than copied. */
export interface BenchGeometry {
	readonly vertices: Float32Array<ArrayBuffer>;
	readonly indices: Uint32Array<ArrayBuffer>;
	readonly lines: Uint32Array<ArrayBuffer>;
	readonly triangleCount: number;

	/** What the field reached in this patch, which the Raw picture is drawn against. */
	readonly rawLow: number;
	readonly rawHigh: number;
}

/** The patch as the contour graph reads it: one height per point of a square grid. */
export interface BenchSections {
	readonly across: number;
	readonly step: number;
	readonly span: number;
	readonly height: Float32Array<ArrayBuffer>;
	readonly lowest: number;
	readonly highest: number;
}

/** A build finished, with everything drawn from it. */
export interface BenchReady {
	readonly kind: "ready";
	readonly token: number;
	readonly facts: BenchFacts;

	/** The flat picture, already painted, as rows of `RGBA`. */
	readonly picture: {
		readonly width: number;
		readonly height: number;
		readonly pixels: Uint8ClampedArray<ArrayBuffer>;
	};

	/** The patch mesh, or nothing when only the picture changed. */
	readonly geometry: BenchGeometry | null;

	readonly sections: BenchSections;
}

/** A build that could not be made, with the reason a reader can act on. */
export interface BenchFailed {
	readonly kind: "failed";
	readonly token: number;
	readonly why: string;
}

export type BenchReply = BenchStep | BenchReady | BenchFailed;
