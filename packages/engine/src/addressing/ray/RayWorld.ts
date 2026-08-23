import type { CellRef } from "../../edit/CellRef.js";

/**
 * What a ray walk asks the world about.
 *
 * Three questions and no data: the walk carries its own cell and never reads a
 * chunk, a mesh or a collider, which is why its cost follows the reach rather
 * than the size of the planet.
 */
export interface RayWorld {
	/** Cells along one face edge, `2 ^ subdivisionDepth`. */
	readonly n: number;

	/** The radius at the top of a layer. */
	radiusOfLayer(layer: number): number;

	/** Which layer a radius falls in, counting downward from the crust top. */
	layerOfRadius(radius: number): number;

	/** Whether a cell stops the ray. */
	solidAt(cell: CellRef): boolean;
}
