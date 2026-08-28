import type { PlantSheet } from "./VegetationMessage.js";
import { splineAt } from "chamfer/generation";

/** Which of a layer's two pictures is drawn. */
export type PlantPicture = "noise" | "density";

/**
 * One layer's picture, as the bytes a canvas takes.
 *
 * **Two questions and only one of them at a time.** `noise` is the reading
 * itself, black at `-1` and white at `+1`, over the whole field with the sea
 * included -- a field has a value everywhere, and the ground picture above
 * already says where the land is. `density` is that reading through the curve,
 * in the layer's own green, with the sea left black because nothing grows in
 * it.
 *
 * **Noise is the one a curve is drawn against.** Past the ends of a curve every
 * value is one colour, which is exactly where a reader needs to see whether
 * there is anything out there.
 */
export function paintPlantSheet(
	sheet: PlantSheet,
	metres: Float32Array,
	curve: readonly (readonly [number, number])[],
	leaf: readonly [number, number, number],
	picture: PlantPicture,
	out: Uint8ClampedArray,
): void {
	const count = sheet.width * sheet.height;
	for (let at = 0; at < count; at++) {
		const value = sheet.noise[at]!;
		let r: number;
		let g: number;
		let b: number;
		if (picture === "noise") {
			const grey = Math.round(
				255 * Math.max(0, Math.min(1, (value + 1) / 2)),
			);
			r = grey;
			g = grey;
			b = grey;
		} else if ((metres[at] ?? 0) <= 0) {
			r = 0;
			g = 0;
			b = 0;
		} else {
			const share = Math.max(0, Math.min(1, splineAt(curve, value)));
			// The layer's own leaf colour, through the screen's curve, so a
			// picture and the canopy it grew are the same green.
			r = Math.round(255 * Math.pow(leaf[0] * share, 1 / 2.2));
			g = Math.round(255 * Math.pow(leaf[1] * share, 1 / 2.2));
			b = Math.round(255 * Math.pow(leaf[2] * share, 1 / 2.2));
		}
		out[at * 4] = r;
		out[at * 4 + 1] = g;
		out[at * 4 + 2] = b;
		out[at * 4 + 3] = 255;
	}
}
