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
	/** Cells on the map, and columns the patch drew. */
	readonly cells: number;
	readonly cellsDrawn: number;

	/** How wide one of the patch's columns is, in metres. */
	readonly columnMetres: number;

	/** Whether the walk reached every column on the planet. */
	readonly whole: boolean;

	/**
	 * Blocks the carve removed with rock still over them, against blocks it
	 * took off the top of a column, against what the sea then filled.
	 *
	 * **The whole question about that layer is which of the first two is
	 * bigger.** Enough blocks off the top in a row is a displaced height field
	 * wearing a 3D field's clothes; a block taken out from *under* rock is a
	 * space, and a space is the only thing a height field could never draw.
	 */
	readonly dugUnder: number;
	readonly dugAbove: number;
	readonly dugDrowned: number;

	/** Masses of rock touching nothing that reaches the bedrock, and their spans. */
	readonly floating: number;
	readonly floatingSpans: number;

	/** Columns holding rock over air over rock, and the deepest stack of them. */
	readonly stacked: number;
	readonly deepest: number;

	/** How long the whole build took, in milliseconds. */
	readonly ms: number;

	/** What the planet is made of, as a share of its cells. */
	readonly bands: readonly number[];

	/** Its tallest and deepest ground, in metres from the sea. */
	readonly summit: number;
	readonly floor: number;

	/** Metres from one side of the patch to the other. */
	readonly span: number;

	readonly lowest: number;
	readonly highest: number;

	/** How much of the patch stands above the water. */
	readonly landShare: number;

	/** How much of the planet stands above sea level, `0` to `1`. */
	readonly land: number;
}

/**
 * One rectangle of the map, one entry per pixel of a flat picture.
 *
 * **Samples, not pixels.** Which picture is drawn is a choice made while
 * looking at the last one, so it must cost nothing: the worker sends what every
 * picture is drawn from and the thread that draws paints whichever is asked
 * for. Five fields over a 256-wide planet is 640 KB moved rather than copied,
 * against a whole map build for the alternative.
 */
export interface BenchSheet {
	readonly width: number;
	readonly height: number;

	/** The ground in metres, the field with no unit, and each layer's curve. */
	readonly metres: Float32Array<ArrayBuffer>;
	readonly raw: Float32Array<ArrayBuffer>;
	readonly continent: Float32Array<ArrayBuffer>;
	readonly erosion: Float32Array<ArrayBuffer>;
	readonly peaks: Float32Array<ArrayBuffer>;

	/** What the carve's curve returned at each point's own surface. */
	readonly carve: Float32Array<ArrayBuffer>;

	/** What the field reached here, which the Raw picture is drawn against. */
	readonly rawLow: number;
	readonly rawHigh: number;

	/** What the ground reached here, which the Height picture is drawn against. */
	readonly low: number;
	readonly high: number;
}

/** The patch as the renderer takes it: the buffers, moved rather than copied. */
export interface BenchGeometry {
	readonly vertices: Float32Array<ArrayBuffer>;

	/**
	 * The triangles and the rim lines, or nothing when the patch did not move.
	 *
	 * **A patch whose ground changed draws the same triangles between the same
	 * vertices.** The shape of a patch is where it stands, not what stands on
	 * it, so the indices are sent when it is laid out and left alone after
	 * that -- three megabytes not crossed and not re-uploaded on every knob.
	 */
	readonly indices: Uint32Array<ArrayBuffer> | null;
	readonly lines: Uint32Array<ArrayBuffer> | null;
	readonly triangleCount: number;

	/**
	 * How many vertices the ground drew and how many the sea did.
	 *
	 * A column mesh shares no vertex -- every face is flat and carries its own
	 * plane -- so it is drawn without indices, in two runs: the ground opaque
	 * and the sea blended after it.
	 */
	readonly groundVertices: number;
	readonly waterVertices: number;

	/**
	 * The box the mesh fills, which a shadow map is fitted to.
	 *
	 * A patch's width says nothing about how far its crust runs down, and the
	 * lip hanging off the rim is geometry that casts.
	 */
	readonly bounds: {
		readonly low: readonly [number, number, number];
		readonly high: readonly [number, number, number];
	};

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

	/** The patch as a flat rectangle, which the small map draws one of. */
	readonly patch: BenchSheet;

	/**
	 * The whole planet as a flat rectangle, or nothing when it did not change.
	 *
	 * A buffer is moved rather than copied, so the worker no longer holds one
	 * it has sent: what it can do instead of sending again is say nothing, and
	 * the thread that draws keeps the one it has. Moving the patch leaves the
	 * planet exactly where it was.
	 */
	readonly planet: BenchSheet | null;

	/** The patch mesh, or nothing when the ground under it did not move. */
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
