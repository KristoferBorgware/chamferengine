import { CoarseGrid } from "./CoarseGrid.js";
import { CoarseMap } from "./CoarseMap.js";

/**
 * A coarse map with nothing on it: no ground, no sea, no erosion.
 *
 * Every cell is zero metres, which is sea level, so the world is a smooth
 * sphere of cells with water standing exactly on it. This is what the pause
 * switch builds, and it is the only state the level of detail can be judged in,
 * because nothing in the picture is terrain.
 *
 * Built from the same topology `buildCoarseMap` uses, so a fine cell finds a
 * flat map exactly where a real one would put a coarse cell -- but no noise is
 * evaluated and no water runs, so this costs a fraction of what a real map
 * does.
 *
 * Takes the world seed even though nothing here reads it: a mesh worker reads
 * its seed off the map it is handed rather than from a separate message.
 */
export function flatCoarseMap(seed: number, level: number): CoarseMap {
	const grid = new CoarseGrid(level);
	return new CoarseMap(seed, grid, new Float32Array(grid.count));
}
