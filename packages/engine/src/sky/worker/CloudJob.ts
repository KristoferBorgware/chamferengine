/** One deck's own numbers, everything a worker needs to build its field. */
export interface CloudDeckSetup {
	/** Which level the puffs come from. */
	readonly level: number;

	/** How many shells deep the deck runs. */
	readonly shells: number;

	/** Metres from the planet's centre to the deck's lowest shell. */
	readonly baseRadius: number;

	/** Metres from one shell to the next. */
	readonly shellSpan: number;

	/** Metres across the noise feature deciding a shell's shape. */
	readonly featureSize: number;
}

/**
 * What a cloud worker is told once, before any wind angle is asked for.
 *
 * One worker holds every deck, rather than one worker per deck, because the
 * decks share nothing costly to duplicate and a caller wants one buffer back.
 */
export interface CloudWorkerSetup {
	readonly kind: "setup";
	readonly seed: number;
	readonly decks: readonly CloudDeckSetup[];
}

/** The wind has turned to a new angle: rebuild every deck. */
export interface CloudJob {
	readonly kind: "blow";
	readonly id: number;
	readonly angle: number;
	readonly axis: readonly [number, number, number];
}

export type CloudWorkerMessage = CloudWorkerSetup | CloudJob;

/**
 * Every deck's geometry in one buffer, the shape `SkyRenderer.setClouds`
 * already takes.
 */
export interface CloudResult {
	readonly id: number;
	readonly vertices: Float32Array<ArrayBuffer>;
	readonly indices: Uint32Array<ArrayBuffer>;
	readonly puffs: number;
}
