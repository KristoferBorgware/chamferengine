import { CoarseGrid } from "./CoarseGrid.js";
import { CoarseMap } from "./CoarseMap.js";

/**
 * A coarse map with nothing on it: no continents, no relief, no sea, no
 * rivers, no erosion.
 *
 * Every field is zero, so `TerrainGenerator`'s own formula does the rest
 * without a special case: `elevation = (0 - 0) * heightScale + detail`
 * collapses to the detail term alone, and the water test `coarseWaterRadius >
 * coarseGroundRadius` is never true, so nothing is ever wet. This is the
 * one-tier height field doc 08 describes before the coarse tier was designed,
 * reached by turning the coarse map off rather than by a second code path.
 *
 * Built from the same topology `buildCoarseMap` uses, so a fine cell finds a
 * flat map exactly where a real one would put a coarse cell -- but nothing
 * evaluates noise, floods a basin, or routes a flow, so this costs a fraction
 * of what a real map does.
 *
 * Takes the world seed even though nothing here reads it: a mesh worker reads
 * its seed off the map it is handed rather than a separate message, so a flat
 * map built with the wrong seed would still be right about the terrain and
 * wrong about the detail noise sitting on it.
 */
export function flatCoarseMap(seed: number, level: number): CoarseMap {
	const grid = new CoarseGrid(level);
	const zero = new Float32Array(grid.count);
	return new CoarseMap(seed, grid, 0, zero, zero, zero, zero);
}
