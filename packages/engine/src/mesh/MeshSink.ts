/**
 * Where a mesher writes its triangles.
 *
 * The whole surface the mesher needs. It names no buffer, no device and no
 * renderer, so a mesher runs under plain Node against an implementation that
 * collects into arrays, and against one that writes straight into mapped GPU
 * memory, without knowing which.
 */
export interface MeshSink {
	/**
	 * Add a vertex and return its index.
	 *
	 * `r`, `g` and `b` are the block's own color with the occlusion at this
	 * corner already in it; `sky` is how much of the sky the cell stands
	 * under, kept apart because a light standing in the world is not reduced
	 * by it and a shader cannot divide it back out of a color.
	 *
	 * `u` and `v` are where in its picture this corner sits, and `layer` is
	 * which picture. `v` runs past 1 down a wall merged over several layers,
	 * so the sampler repeats rather than the mesher cutting the run up.
	 */
	vertex(
		x: number,
		y: number,
		z: number,
		r: number,
		g: number,
		b: number,
		sky: number,
		u: number,
		v: number,
		layer: number,
	): number;

	/** Join three vertices, counter-clockwise seen from outside. */
	triangle(a: number, b: number, c: number): void;
}
