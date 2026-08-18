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

	/** Ground fall per metre travelled, at the coarse map's resolution. */
	readonly gradient: number;
}
