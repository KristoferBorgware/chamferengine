import type { BenchSheet } from "./BenchMessage.js";
import type { BenchWorld } from "./BenchWorld.js";
import { emptySheet } from "./emptySheet.js";
import { makeBlend, readBlend } from "chamfer/generation";
import { positionOf } from "chamfer/coordinates";

/** How many pixels across the flat planet is drawn. */
export const PLANET_WIDE = 512;

/**
 * The whole planet, longitude across and latitude down.
 *
 * The one projection where a pixel's direction is a latitude and a longitude
 * and no case analysis. It stretches the poles, and it is a picture of where
 * things are rather than a map anything is measured off.
 *
 * **No carve here, and it is not an omission.** Its shapes are 120 m and this
 * picture is 512 points around a 42,730 m circumference -- one point every
 * 83 m, so a shape is not two points across and neighbouring points are
 * unrelated. What that draws is television static: an honest sampling of the
 * field and a picture of nothing. The carve's picture is always the patch,
 * where the same shape is forty points across.
 */
export function planetSheet(world: BenchWorld): BenchSheet {
	const grid = world.cells!;
	const layers = world.stacks!;
	const wide = PLANET_WIDE;
	const tall = wide / 2;
	const sheet = emptySheet(wide, tall);
	let rawLow = Infinity;
	let rawHigh = -Infinity;
	for (const v of world.raw) {
		if (v < rawLow) rawLow = v;
		if (v > rawHigh) rawHigh = v;
	}
	// One lookup a pixel, five fields read off it.
	const blend = makeBlend();
	for (let r = 0; r < tall; r++) {
		const latitude = (0.5 - (r + 0.5) / tall) * 180;
		for (let q = 0; q < wide; q++) {
			const longitude = ((q + 0.5) / wide) * 360 - 180;
			const dir = positionOf({ latitude, longitude, altitude: 0 }, 1);
			const at = r * wide + q;
			grid.blendInto(dir, blend);
			sheet.metres[at] = readBlend(world.height, blend);
			sheet.raw[at] = readBlend(world.raw, blend);
			sheet.continent[at] = readBlend(layers.continent, blend);
			sheet.erosion[at] = readBlend(layers.erosion, blend);
			sheet.peaks[at] = readBlend(layers.peaks, blend);
		}
	}
	return {
		...sheet,
		rawLow,
		rawHigh,
		// The whole planet's own range, because this picture is of the whole
		// planet: a patch's ends would blow out everything taller.
		low: world.floor,
		high: world.summit,
	};
}
