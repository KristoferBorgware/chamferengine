import {
	CONT_BANDS,
	ERO_BANDS,
	GRID_CELLS,
	GRID_CELLS_FLAT,
	PV_BANDS,
	RISE_BANDS,
	type LandformGrid,
} from "./LandformGrid.js";

/**
 * A grid written before the height axis existed, spread across it.
 *
 * **A link is a world, and a world does not stop being one because an axis
 * was added under it.** A grid used to be one sheet per continentalness; it
 * is now one per continentalness and height. Repeating each old sheet across
 * all three height bands is the only reading that leaves the world it named
 * exactly as it was -- the new axis then decides nothing, which is what it
 * decided before.
 *
 * Anything already the full length is handed back untouched, and anything of
 * neither length is not a grid.
 */
export function riseGrid(grid: LandformGrid): LandformGrid | null {
	if (grid.length === GRID_CELLS) return grid;
	if (grid.length !== GRID_CELLS_FLAT) return null;
	const sheet = ERO_BANDS * PV_BANDS;
	let out = "";
	for (let cont = 0; cont < CONT_BANDS; cont++) {
		const was = grid.slice(cont * sheet, (cont + 1) * sheet);
		for (let rise = 0; rise < RISE_BANDS; rise++) out += was;
	}
	return out;
}
