/**
 * Where a mesher writes its triangles.
 *
 * The whole surface the mesher needs. It names no buffer, no device and no
 * renderer, so a mesher runs under plain Node against an implementation that
 * collects into arrays, and against one that writes straight into mapped GPU
 * memory, without knowing which.
 */
export interface MeshSink {
	/** Add a vertex and return its index. */
	vertex(
		x: number,
		y: number,
		z: number,
		r: number,
		g: number,
		b: number,
	): number;

	/** Join three vertices, counter-clockwise seen from outside. */
	triangle(a: number, b: number, c: number): void;
}
