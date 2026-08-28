import type { CoarseField, CoarseMap } from "chamfer/generation";
import { coarseFieldOf, makeBlend, readBlend } from "chamfer/generation";
import { positionOf } from "chamfer/coordinates";
import { paintPatch } from "./paintPatch.js";

/**
 * Draw one field of a coarse map into an image, longitude across and latitude
 * down.
 *
 * **A pixel asks the map what the ground is under it, and the map blends.**
 * The map holds 655,362 cells at the shipped level against a picture of
 * 131,072 pixels, and the obvious two ways of getting from one to the other
 * are both wrong. Asking each pixel which single cell it sits on shows one
 * cell in five and drops the rest, which reads as speckle. Scattering every
 * cell into whichever pixel it lands in and averaging looks safe and is the
 * one that shipped here: the cells fall on a lattice and the pixels on a
 * rectangle, so a pixel catches four cells or twelve with nothing saying
 * which -- and the mean of four is not the mean of twelve. Under a picture
 * whose colours are **bands**, a pixel a few metres either side of the rock
 * line then flips material on the count alone, which is the mottling that
 * made this picture disagree with the bench's over the same ground.
 *
 * The blend is the third way and the one the bench already used: the three
 * cells of the triangle a direction lands in, weighted by where in it the
 * direction fell. It is smooth, it costs one lookup a pixel rather than one
 * pass over the whole map, and it is the same reading `columnAt` takes -- so
 * the picture is of the ground the world builds rather than of the sampling.
 *
 * **The colour comes from `paintPatch`, which is the bench's own painter.**
 * Two pictures of one planet drawn by two functions is two answers to what the
 * ground is made of, and they had drifted: this one had no depth in the water
 * and no contour on the land.
 *
 * The rectangle is the picture and never the storage. It stretches at the top
 * and bottom, where a row of pixels covers a few metres of ground, and that is
 * a property of drawing a sphere flat. Latitude and longitude come from the
 * axis doc 20 fixes through two pentagons, so the same place lands in the same
 * pixel on every world.
 */
export function paintCoarseField(
	map: CoarseMap,
	field: CoarseField,
	width: number,
	height: number,
	into: Uint8ClampedArray,
): void {
	const values = coarseFieldOf(map, field);
	// Ground names the block that stands there; every other field is a height
	// read against its own ramp, which is what the grey picture is.
	const picture = field.id === "ground" ? "ground" : "height";
	const blend = makeBlend();
	for (let r = 0; r < height; r++) {
		const latitude = (0.5 - (r + 0.5) / height) * 180;
		for (let q = 0; q < width; q++) {
			const longitude = ((q + 0.5) / width) * 360 - 180;
			const dir = positionOf({ latitude, longitude, altitude: 0 }, 1);
			map.index.blendInto(dir, blend);
			const metres = readBlend(values, blend);
			paintPatch(into, (r * width + q) * 4, {
				metres,
				raw: metres,
				layer: 0,
				rawLow: field.ramp.low,
				rawHigh: field.ramp.high,
				low: field.ramp.low,
				high: field.ramp.high,
				picture,
			});
		}
	}
}
