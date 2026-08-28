import type { BenchSheet } from "./BenchMessage.js";
import type { PlanetKnobs } from "./PlanetSettings.js";
import type { PlantLayerDraft } from "./PlantDraft.js";

/** One rebuild of the ground and everything standing on it. */
export interface VegetationRequest {
	readonly kind: "build";

	/** Rises with every request, so a stale reply can be recognised and dropped. */
	readonly token: number;

	readonly knobs: PlanetKnobs;

	/**
	 * Every vegetation layer, in the order they are offered a cell.
	 *
	 * Plain data rather than the panel's own objects: a class does not survive
	 * being posted, and the order is the tie-break, so it travels as a list.
	 */
	readonly layers: readonly PlantLayerDraft[];

	/**
	 * How many blocks across to cut the patch, when that is not the knob.
	 *
	 * A slider being dragged asks for half the width, so the ground follows the
	 * pointer and the settled value builds the patch that was asked for.
	 */
	readonly blocks: number;
}

/** A stage started or moved, so the status line can say what is happening. */
export interface VegetationStep {
	readonly kind: "step";
	readonly token: number;
	readonly says: string;
	readonly done: number;
}

/**
 * One layer's own field over the rectangle every picture is drawn from.
 *
 * **The reading itself, never what the curve made of it.** The curve has a
 * graph directly above the picture, so a picture of its output says the same
 * thing twice -- and a curve cannot be drawn against a picture the curve has
 * already been applied to, because past its ends every value is one colour.
 * The panel reads this through the curve itself when the density picture is
 * asked for, which costs a pass over a rectangle already here.
 */
export interface PlantSheet {
	readonly id: number;
	readonly width: number;
	readonly height: number;
	readonly noise: Float32Array<ArrayBuffer>;
}

/**
 * How much of the planet's land reads each value of one layer's field.
 *
 * **The bars are what make the curve's x axis mean anything.** A field's range
 * is `-1` to `+1` and it reaches nowhere near either end, so equal widths of a
 * curve cover wildly unequal amounts of ground. Counted over the land alone,
 * because a vegetation curve is read on land and nowhere else and the sea is
 * most of a planet with continents on it.
 */
export interface PlantTally {
	readonly id: number;
	readonly counts: Float32Array<ArrayBuffer>;
	readonly tallest: number;

	/** How many of the sampled places were land, which is what the bars are of. */
	readonly land: number;
}

/** What a finished build hands back that is a number rather than a buffer. */
export interface VegetationFacts {
	/** Cells on the map, and columns the patch drew. */
	readonly cells: number;
	readonly cellsDrawn: number;

	/** How many cells the plants were chosen on, whatever level is drawn. */
	readonly roots: number;

	/** How wide one drawn column is, in metres, and how wide the patch is. */
	readonly columnMetres: number;
	readonly span: number;

	/** How long the whole build took, in milliseconds. */
	readonly ms: number;

	/** What the planet is made of, as a share of its cells. */
	readonly bands: readonly number[];
	readonly summit: number;
	readonly floor: number;
	readonly land: number;

	/** The ground this patch reached, in metres, and how much of it is dry. */
	readonly lowest: number;
	readonly highest: number;
	readonly landShare: number;

	/** Plants grown in territory their chunk owned, and cells of each material. */
	readonly plants: number;
	readonly wood: number;
	readonly leaf: number;

	/** Separate pieces the wood is in, and the share of it standing on ground. */
	readonly pieces: number;
	readonly rooted: number;

	/** The tallest and shortest plant grown, and how far the widest reached. */
	readonly tallest: number;
	readonly shortest: number;
	readonly widest: number;

	/** How many chunks the patch was cut into, and what they were offered. */
	readonly chunks: number;
	readonly rootsTested: number;
	readonly rootsOwned: number;

	/** How much of the land a player could still step onto. */
	readonly walkable: number;

	/** Per layer id, how many plants it grew. */
	readonly grown: readonly { readonly id: number; readonly count: number }[];
}

/** The patch and its plants as the renderer takes them. */
export interface VegetationGeometry {
	readonly vertices: Float32Array<ArrayBuffer>;
	readonly lines: Uint32Array<ArrayBuffer> | null;

	/** How many vertices the opaque run takes, and how many of those are plants. */
	readonly groundVertices: number;
	readonly plantVertices: number;
	readonly waterVertices: number;

	readonly bounds: {
		readonly low: readonly [number, number, number];
		readonly high: readonly [number, number, number];
	};

	readonly rawLow: number;
	readonly rawHigh: number;
}

/** A build finished, with everything drawn from it. */
export interface VegetationReady {
	readonly kind: "ready";
	readonly token: number;
	readonly facts: VegetationFacts;

	/** The patch as a flat rectangle, and the planet when it moved. */
	readonly patch: BenchSheet;
	readonly planet: BenchSheet | null;

	/** One picture per layer, over whichever rectangle is being shown. */
	readonly sheets: readonly PlantSheet[];

	/**
	 * The ground under that rectangle, at the same resolution.
	 *
	 * One for every layer, because the ground under a picture is the same
	 * ground whichever layer is asking. It is what leaves the sea black in the
	 * density picture.
	 */
	readonly shot: PlantSheet;
	readonly tallies: readonly PlantTally[];

	readonly geometry: VegetationGeometry | null;
}

/** A build that could not be made, with the reason a reader can act on. */
export interface VegetationFailed {
	readonly kind: "failed";
	readonly token: number;
	readonly why: string;
}

export type VegetationReply =
	VegetationStep | VegetationReady | VegetationFailed;
