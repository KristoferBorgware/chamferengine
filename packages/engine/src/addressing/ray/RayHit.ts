import type { CellRef } from "../../edit/CellRef.js";

/** Where a ray walk stopped. */
export interface RayHit {
	/** The first cell along the ray that stopped it. */
	readonly cell: CellRef;

	/**
	 * The cell the ray was in immediately before, or `null` when the very first
	 * cell was already solid.
	 *
	 * The walk knows which boundary it crossed to enter the hit, so a block
	 * placed against the face being looked at goes here.
	 */
	readonly previous: CellRef | null;

	/** How far along the ray the hit cell was entered, in the direction's own units. */
	readonly distance: number;

	/** How many cells the walk stepped through, the hit included. */
	readonly stepped: number;
}
