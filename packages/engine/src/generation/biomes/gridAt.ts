import { ERO_BANDS, PV_BANDS } from "./LandformGrid.js";

/**
 * The index of one landform-grid cell, from its three band indices.
 *
 * Continentalness selects the sheet, erosion the row and peaks-and-valleys the
 * column, so the grid string reads sheet by sheet, row by row.
 */
export function gridAt(cont: number, ero: number, pv: number): number {
	return (cont * ERO_BANDS + ero) * PV_BANDS + pv;
}
