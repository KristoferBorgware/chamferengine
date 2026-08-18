import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import type { CoarseMapSnapshot } from "./CoarseMapSnapshot.js";
import type { CoarseStage } from "./CoarseStage.js";
import { CoarseMapBuilder } from "./CoarseMapBuilder.js";

/** What the thread that draws sends first, once. */
export interface MapWorkerSetup {
	readonly kind: "setup";
	readonly level: number;
}

/** One rebuild, at whichever step the knob that changed first reaches. */
export interface MapWorkerRequest {
	readonly kind: "build";

	/** Rises with every request, so a stale step can be recognised and dropped. */
	readonly token: number;

	readonly seed: number;
	readonly options: CoarseMapOptions;
	readonly from: CoarseStage;
}

export type MapWorkerMessage = MapWorkerSetup | MapWorkerRequest;

/** One step finished, on its way back. */
export interface MapWorkerStep {
	readonly token: number;
	readonly stage: CoarseStage;
	readonly done: boolean;
	readonly snapshot: CoarseMapSnapshot;
}

/**
 * A coarse map built off the thread that draws, a step at a time.
 *
 * Everything here runs under plain Node and mentions neither `Worker` nor
 * `postMessage`, so it is tested rather than only exercised. The browser half
 * is the file that receives a message, drives this, and posts what it yields.
 *
 * The builder is held for the worker's whole life, so the grid is built once
 * and a request naming a later step starts from what the last one left.
 *
 * **Steps are yielded rather than returned together.** A caller between two
 * of them can hand the event loop back, which is the only place a request that
 * has been superseded can be dropped: a stage runs to its end once started, so
 * the coarsest a rebuild can be abandoned is between two of them.
 */
export class MapWorkerCore {
	private readonly builder: CoarseMapBuilder;

	constructor(setup: MapWorkerSetup) {
		this.builder = new CoarseMapBuilder(setup.level);
	}

	*steps(request: MapWorkerRequest): Generator<MapWorkerStep> {
		for (const step of this.builder.build(
			request.seed,
			request.options,
			request.from,
		))
			yield {
				token: request.token,
				stage: step.stage,
				done: step.done,
				snapshot: step.map.toSnapshot(),
			};
	}
}
