import type { BenchSheet } from "./BenchMessage.js";

/**
 * Six empty fields of one size, which is what every flat picture is drawn from.
 *
 * **Samples, not pixels.** Which picture a bench draws is a choice made while
 * looking at the last one, so it has to cost nothing: the worker fills all six
 * and the thread that draws paints whichever is asked for.
 */
export function emptySheet(
	width: number,
	height: number,
): Omit<BenchSheet, "rawLow" | "rawHigh" | "low" | "high"> {
	const count = width * height;
	return {
		width,
		height,
		metres: new Float32Array(count),
		raw: new Float32Array(count),
		continent: new Float32Array(count),
		erosion: new Float32Array(count),
		peaks: new Float32Array(count),
		carve: new Float32Array(count),
	};
}
