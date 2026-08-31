import { ERO_BANDS, PV_BANDS, RISE_BANDS } from "./LandformGrid.js";

/**
 * The index of one landform-grid cell, from its four band indices.
 *
 * Continentalness and height select the sheet, erosion the row and
 * peaks-and-valleys the column, so the grid string reads sheet by sheet, row
 * by row. The two that select a sheet are the two a reader switches between
 * rather than reads across, which is why they are the outer pair.
 */
export function gridAt(
	cont: number,
	rise: number,
	ero: number,
	pv: number,
): number {
	return ((cont * RISE_BANDS + rise) * ERO_BANDS + ero) * PV_BANDS + pv;
}
