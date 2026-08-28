import type { BenchSheet } from "./BenchMessage.js";
import type { PatchField } from "./patchField.js";
import { emptySheet } from "./emptySheet.js";

/**
 * One patch of the map, one sample a pixel.
 *
 * The rows are turned over here rather than where they are painted: north is up
 * on a picture and the field is read from the south edge outward, and a picture
 * that is drawn six ways should be flipped once.
 */
export function patchSheet(field: PatchField): BenchSheet {
	const n = field.across - 1;
	const sheet = emptySheet(n, n);
	for (let r = 0; r < n; r++)
		for (let q = 0; q < n; q++) {
			const from = r * field.across + q;
			const to = (n - 1 - r) * n + q;
			sheet.metres[to] = field.height[from]!;
			sheet.raw[to] = field.raw[from]!;
			sheet.continent[to] = field.continent[from]!;
			sheet.erosion[to] = field.erosion[from]!;
			sheet.peaks[to] = field.peaks[from]!;
			sheet.carve[to] = field.carve[from]!;
		}
	return {
		...sheet,
		rawLow: field.rawLow,
		rawHigh: field.rawHigh,
		low: field.lowest,
		high: field.highest,
	};
}
