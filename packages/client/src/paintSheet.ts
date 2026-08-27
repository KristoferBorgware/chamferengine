import type { BenchSheet } from "./BenchMessage.js";
import type { PatchPicture } from "./PatchLook.js";
import { paintPatch } from "./paintPatch.js";

/**
 * One flat picture of a sheet of samples, in whichever picture is selected.
 *
 * **The picture is a colour per sample, so choosing one is a repaint.** Every
 * picture the bench draws reads the same five fields at the same places and
 * differs only in what colour it gives them, so the worker sends the fields
 * once and this turns them into whichever picture is asked for -- on the thread
 * that draws, in a millisecond or two over a 256-wide planet, with nothing
 * rebuilt and nothing waited for.
 */
export function paintSheet(
	sheet: BenchSheet,
	picture: PatchPicture,
	into: Uint8ClampedArray,
): void {
	const layer =
		picture === "peaks"
			? sheet.peaks
			: picture === "erosion"
				? sheet.erosion
				: sheet.continent;
	for (let at = 0; at < sheet.width * sheet.height; at++)
		paintPatch(into, at * 4, {
			metres: sheet.metres[at]!,
			raw: sheet.raw[at]!,
			layer: layer[at]!,
			cut: sheet.cut[at]!,
			cutScale: sheet.cutScale,
			rawLow: sheet.rawLow,
			rawHigh: sheet.rawHigh,
			low: sheet.low,
			high: sheet.high,
			picture,
		});
}
