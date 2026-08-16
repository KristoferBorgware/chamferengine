/**
 * Interleaved vertex data and the indices that draw it.
 *
 * This is the whole contract between a mesher and a renderer. A mesher fills
 * these two typed arrays and holds no `GPUDevice`, no `GPUBuffer` and no
 * renderer object, so it runs under plain Node with no GPU present. The
 * renderer uploads them and knows nothing about how they were produced.
 */
export interface Geometry {
	/** Position and color per vertex: x, y, z, r, g, b. */
	readonly vertices: Float32Array<ArrayBuffer>;
	readonly indices: Uint32Array<ArrayBuffer>;
	readonly cellCount: number;
	readonly triangleCount: number;
}
