import type { NoiseSettings } from "../../generation/noise/NoiseSettings.js";
import type { TerrainLayer } from "../../generation/coarse/TerrainLayer.js";
import {
	carveDepth,
	carveIsRock,
} from "../../generation/terrain/carveDensity.js";

/**
 * The most block layers a column is ever walked.
 *
 * The walk is one block a step and the depth it goes is the carve's own reach,
 * which is measured in the layer's shape width -- so a world with kilometres of
 * relief and a wide shape would otherwise ask for a column walked for
 * kilometres, once per cell, while a slider is moving.
 */
export const MAX_CARVE_LAYERS = 512;

/** How deep a column is drawn, which is the volume the carve works in. */
export function columnDepth(layer: TerrainLayer, blockMetres: number): number {
	return Math.min(carveDepth(layer), blockMetres * MAX_CARVE_LAYERS);
}

/** What a column walk removed, split into the two kinds. */
export interface Carved {
	/**
	 * Blocks taken out from *under* rock, which is the only kind a height field
	 * could never have drawn.
	 */
	under: number;

	/** Blocks taken off the top of a column, which only lowers the ground. */
	above: number;

	/** Blocks opened below sea level, where the sea fills what was opened. */
	drowned: number;
}

/**
 * One column of ground, as the heights where rock starts and stops.
 *
 * **A column is a list of heights, not one height.** With the carve off a
 * column holds exactly one pair and the mesh is the height field it always
 * was; with it on a column can hold three or five, and rock over air over rock
 * is a shape one number could not hold at all.
 *
 * The block layers are indices, so two neighbouring columns cut their blocks on
 * the same planes -- a grid one column rounded for itself would draw a step
 * between every pair of columns and nowhere else. A block is rock or air whole,
 * so a face is the plane between two layers rather than the point the density
 * crossed the line.
 *
 * Writes pairs of heights, low to high, into `out`, and what it removed into
 * `carved`.
 */
export function columnSpans(
	x: number,
	y: number,
	z: number,
	surface: number,
	radius: number,
	blockMetres: number,
	seed: number,
	layer: TerrainLayer,
	settings: NoiseSettings,
	out: number[],
	carved: Carved,
	seaLevel = 0,
	hold?: number,
): void {
	out.length = 0;
	carved.under = 0;
	carved.above = 0;
	carved.drowned = 0;
	const deep = columnDepth(layer, blockMetres);
	const first = Math.floor((surface - deep) / blockMetres);
	const last = Math.floor(surface / blockMetres);
	let from = first * blockMetres;
	let rock = true;
	let opened = 0;
	for (let L = first; L <= last; L++) {
		const up = (L + 0.5) * blockMetres;
		// Above the ground the three fields drew there is nothing to carve and
		// nothing to keep.
		let solid = up < surface;
		if (solid)
			solid = carveIsRock(
				x,
				y,
				z,
				radius,
				surface,
				surface - up,
				seed,
				layer,
				settings,
				hold,
			);
		if (!solid && up < surface) {
			opened++;
			// **The sea is a surface at a fixed radius, so anything opened
			// under it is filled and seen as water.** On low ground that is
			// most of the carve, and a reader looking at a flat blue sheet has
			// no way to tell the layer did anything there at all.
			if (up < seaLevel) carved.drowned++;
		}
		if (solid === rock) continue;
		if (rock) out.push(from, L * blockMetres);
		else from = L * blockMetres;
		rock = solid;
	}
	if (rock) out.push(from, (last + 1) * blockMetres);
	// Everything dug under the highest rock left standing is a hole; the rest
	// is the top of the column having moved down.
	carved.above = 0;
	if (out.length > 0) {
		const top = out[out.length - 1]!;
		for (let up = top + blockMetres / 2; up < surface; up += blockMetres)
			carved.above++;
	}
	carved.under = opened - carved.above;
}

/**
 * The same column with the carve switched off: the height field on the block
 * grid.
 *
 * **The same block grid, because the grid is the world's and not the layer's.**
 * The ground is the height field rounded to the nearest layer boundary, which
 * is the terracing the engine builds and the shape a carve is cut out of.
 */
export function plainSpan(
	surface: number,
	blockMetres: number,
	layer: TerrainLayer,
	out: number[],
): number {
	const top = Math.round(surface / blockMetres) * blockMetres;
	out.length = 0;
	out.push(top - columnDepth(layer, blockMetres), top);
	return top;
}
