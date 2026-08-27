import type { CoarseGrid } from "../generation/coarse/CoarseGrid.js";
import type { PatchFields } from "./patchVertices.js";
import type { PatchGeometry } from "./PatchGeometry.js";
import type { PatchPlace } from "./patchLayout.js";
import { patchLayout } from "./patchLayout.js";
import { patchVertices } from "./patchVertices.js";

/** What the patch is cut from, and how it is laid out. */
export type PatchOptions = PatchPlace & PatchFields;

/**
 * A patch of the surface, one hexagon per map cell.
 *
 * **The pass is in two halves, and this is both of them.** `patchLayout` finds
 * the cells and lays out their corners; `patchVertices` pours the ground into
 * what it found. A caller drawing a patch once wants this. A caller whose patch
 * stands still while the ground under it moves -- which is every knob on the
 * landscape bench -- keeps the layout and runs the fill alone.
 */
export function coarsePatchMesh(
	grid: CoarseGrid,
	options: PatchOptions,
): PatchGeometry {
	const layout = patchLayout(grid, options);
	const fill = patchVertices(layout, options);
	return {
		vertices: fill.vertices,
		indices: layout.indices,
		lines: layout.lines,
		cellCount: layout.cellCount,
		triangleCount: layout.triangleCount,
		span: layout.span,
		lowest: fill.lowest,
		highest: fill.highest,
		rawLow: fill.rawLow,
		rawHigh: fill.rawHigh,
		landShare: fill.landShare,
	};
}
