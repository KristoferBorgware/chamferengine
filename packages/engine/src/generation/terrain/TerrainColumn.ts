/**
 * One column of the world, evaluated once and then read layer by layer.
 *
 * The height field runs per column, not per cell: a chunk of 561 columns costs
 * 561 evaluations however deep the crust is. Everything a block below this
 * column needs is here, so reading down it is arithmetic.
 */
export interface TerrainColumn {
	readonly face: number;
	readonly i: number;
	readonly j: number;

	/** The unit direction the column points along. */
	readonly x: number;
	readonly y: number;
	readonly z: number;

	/** The radius the ground surface reaches. */
	readonly groundRadius: number;

	/** The radius water stands at, equal to the ground radius where dry. */
	readonly waterRadius: number;

	/** The first layer holding ground. Layers above it are air or water. */
	readonly groundLayer: number;

	/** The first layer at or below the water surface. */
	readonly waterLayer: number;

	/** Metres of ground above sea level, negative under the ocean. */
	readonly elevation: number;

	/**
	 * Metres of rock this column keeps over the roof of a cave.
	 *
	 * **A fact about the column, so it is read here rather than per layer.**
	 * The ceiling wanders over the ground -- it is what gives a cave a way to
	 * the surface -- and every layer of one column sits under the same amount
	 * of it, so reading it per block would be two noise lookups a block for an
	 * answer that never changes down the column.
	 */
	readonly caveCeiling: number;
}
