/**
 * A coarse map as plain typed arrays, ready to cross a worker boundary.
 *
 * Every field is transferable, so a pool hands each worker the arrays without
 * a structured clone of anything else.
 */
export interface CoarseMapSnapshot {
	readonly seed: number;
	readonly level: number;
	readonly faceIndex: Int32Array;
	readonly height: Float32Array;
}
