import type { CoarseField, CoarseMap } from "chamfer/generation";
import { coarseFieldOf } from "chamfer/generation";
import { geographicOf } from "chamfer/coordinates";
import { latticePosition, positionToCell } from "chamfer/addressing";
import { positionOf } from "chamfer/coordinates";

/** Where a value sits between a ramp's two ends, held to `0` and `1`. */
function alongRamp(
	value: number,
	field: CoarseField,
	seaLevel: number,
): number {
	const raw =
		field.scale === "sea"
			? value - seaLevel
			: field.scale === "log"
				? Math.log(1 + Math.max(0, value))
				: value;
	const { low, high } = field.ramp;
	return Math.min(1, Math.max(0, (raw - low) / (high - low)));
}

/**
 * Draw one field of a coarse map into an image, longitude across and latitude
 * down.
 *
 * **Every cell is drawn, and a pixel is the average of the cells that land on
 * it.** A map at level 8 holds 655,362 cells against a picture of 131,072
 * pixels, so asking each pixel which cell it sits on would show one cell in
 * five and drop the rest — which reads as speckle, because neighbouring cells
 * of a field with relief in it are not the same color. Walking the cells
 * instead makes the picture a mean rather than a sample, and costs one pass
 * over the map rather than one lookup per pixel.
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
	const n = 1 << map.level;
	const stops = field.ramp.stops;
	const spans = stops.length - 1;

	const sum = new Float32Array(width * height);
	const count = new Uint32Array(width * height);
	// A cell on a face edge answers to several names and is one cell. Taking it
	// once per name would weight the thirty seams twice over and the twelve
	// icosahedron vertices five times.
	const taken = new Uint8Array(map.count);

	for (let face = 0; face < 20; face++)
		for (let i = 0; i <= n; i++)
			for (let j = 0; i + j <= n; j++) {
				const cell = map.index.indexOf(face, i, j);
				if (cell < 0 || taken[cell]) continue;
				taken[cell] = 1;

				const place = geographicOf(latticePosition(face, n, i, j), 1);
				const x = Math.min(
					width - 1,
					Math.max(
						0,
						Math.floor(((place.longitude + 180) / 360) * width),
					),
				);
				const y = Math.min(
					height - 1,
					Math.max(
						0,
						Math.floor(((90 - place.latitude) / 180) * height),
					),
				);
				const at = y * width + x;
				sum[at]! += alongRamp(values[cell] ?? 0, field, map.seaLevel);
				count[at]!++;
			}

	// Near the poles a row of pixels is wider than the ring of cells under it,
	// so some pixels catch nothing. Those few ask which cell they sit on, which
	// is the lookup this function avoids everywhere else.
	for (let at = 0; at < width * height; at++) {
		if (count[at]) continue;
		const y = Math.floor(at / width);
		const x = at - y * width;
		const place = {
			latitude: 90 - ((y + 0.5) / height) * 180,
			longitude: ((x + 0.5) / width) * 360 - 180,
			altitude: 0,
		};
		const cell = positionToCell(positionOf(place, 1), n);
		sum[at] = alongRamp(
			values[map.index.indexOf(cell.face, cell.i, cell.j)] ?? 0,
			field,
			map.seaLevel,
		);
		count[at] = 1;
	}

	for (let at = 0; at < width * height; at++) {
		const t = (count[at] ? sum[at]! / count[at]! : 0) * spans;
		const first = Math.min(spans - 1, Math.floor(t));
		const mix = t - first;
		const a = stops[first]!;
		const b = stops[first + 1]!;
		into[at * 4] = 255 * (a[0] + (b[0] - a[0]) * mix);
		into[at * 4 + 1] = 255 * (a[1] + (b[1] - a[1]) * mix);
		into[at * 4 + 2] = 255 * (a[2] + (b[2] - a[2]) * mix);
		into[at * 4 + 3] = 255;
	}
}
